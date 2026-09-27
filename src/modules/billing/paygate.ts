/**
 * Paiement en ligne des licences.
 *
 * - « paygate » : PayGate Global (Togo), TMoney et Flooz. Le serveur demande le paiement avec la clé API
 *   (jamais montrée au client) ; le client confirme sur son téléphone ; PayGate prévient le serveur
 *   (POST /api/paiements/paygate) et le serveur vérifie toujours le statut auprès de PayGate avant de livrer.
 * - « simulation » : aucun argent ne circule, une page de test permet d'accepter ou de refuser le paiement.
 *   Elle n'est active que si PAYMENT_MODE=simulation, ou hors production quand aucune clé PayGate n'est configurée.
 */

export type PaymentMode = "paygate" | "simulation";
export const NETWORKS = { TMONEY: "TMoney", FLOOZ: "Flooz" } as const;
export type Network = keyof typeof NETWORKS;

const API = process.env.PAYGATE_API_URL || "https://paygateglobal.com";

export function paymentMode(): PaymentMode | null {
  const mode = process.env.PAYMENT_MODE;
  if (mode === "simulation") return "simulation";
  if (process.env.PAYGATE_API_KEY) return "paygate";
  if (!mode && process.env.NODE_ENV !== "production") return "simulation";
  return null;
}

type PayResult = { ok: true; txReference: string | null } | { ok: false; reason: string };

const PAY_ERRORS: Record<number, string> = {
  2: "Clé PayGate invalide (vérifiez PAYGATE_API_KEY)",
  4: "Paramètres refusés par PayGate (numéro ou montant)",
  6: "Paiement déjà demandé pour cette commande",
};

/** Demande le paiement : PayGate envoie la demande de confirmation sur le téléphone du client. */
export async function requestPaygatePayment(p: { reference: string; amount: number; phone: string; network: Network; description: string }): Promise<PayResult> {
  try {
    const res = await fetch(`${API}/api/v1/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auth_token: process.env.PAYGATE_API_KEY,
        phone_number: p.phone,
        amount: Math.round(p.amount),
        description: p.description.slice(0, 100),
        identifier: p.reference,
        network: p.network,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { tx_reference?: string; status?: number };
    if (body.status === 0) return { ok: true, txReference: body.tx_reference ?? null };
    return { ok: false, reason: PAY_ERRORS[body.status ?? -1] ?? `PayGate a refusé la demande (HTTP ${res.status})` };
  } catch {
    return { ok: false, reason: "PayGate ne répond pas, réessayez dans un instant" };
  }
}

export type PaymentStatus = { state: "paid"; paymentRef: string | null; method: string | null } | { state: "pending" } | { state: "failed"; reason: string };

/** Statut d'un paiement, demandé à PayGate à partir de notre référence de commande. */
export async function paygateStatus(reference: string): Promise<PaymentStatus> {
  try {
    const res = await fetch(`${API}/api/v2/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auth_token: process.env.PAYGATE_API_KEY, identifier: reference }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: number; payment_reference?: string; payment_method?: string };
    switch (body.status) {
      case 0:
        return { state: "paid", paymentRef: body.payment_reference ?? null, method: body.payment_method ?? null };
      case 4:
        return { state: "failed", reason: "Paiement expiré : la confirmation n'a pas été faite à temps" };
      case 6:
        return { state: "failed", reason: "Paiement annulé" };
      default:
        return { state: "pending" };
    }
  } catch {
    return { state: "pending" };
  }
}

/** Numéro au format attendu par PayGate : 8 chiffres, sans l'indicatif +228. */
export function localPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("228") ? digits.slice(3) : digits;
}
