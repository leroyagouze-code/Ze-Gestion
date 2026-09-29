import { formatMoney, round } from "./money";

/**
 * Codes promo : règles communes aux codes de la plateforme (licences, abonnements) et à ceux des
 * entreprises (caisse). Fonctions pures, utilisables aussi dans le navigateur pour l'aperçu :
 * le serveur refait toujours le calcul à partir de la base.
 */

export type PromoKind = "percent" | "amount";
export const PROMO_KINDS: Record<PromoKind, string> = { percent: "Pourcentage", amount: "Montant fixe" };

export type PromoRule = {
  code: string;
  kind: string;
  value: number;
  startsOn: string | null;
  endsOn: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  minPurchase?: number | null;
};

/** Forme saisie : espaces retirés, majuscules (un code est reconnu quelle que soit la casse). */
export const normalizePromoCode = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** Réduction sur un montant : jamais négative, jamais supérieure au montant. */
export function promoDiscount(p: { kind: string; value: number }, base: number, decimals = 0) {
  if (!(base > 0) || !(p.value > 0)) return 0;
  const raw = p.kind === "percent" ? (base * Math.min(p.value, 100)) / 100 : p.value;
  return round(Math.min(raw, base), decimals);
}

/**
 * Raison pour laquelle le code ne peut pas servir aujourd'hui (message pour le client), ou null.
 * today : date du jour au format YYYY-MM-DD dans le fuseau de l'entreprise (ou de la plateforme).
 */
export function promoProblem(p: PromoRule, today: string, base?: number, currency = "XOF") {
  if (!p.isActive) return "Ce code promo n'est plus actif";
  if (p.startsOn && today < p.startsOn) return "Ce code promo n'est pas encore valable";
  if (p.endsOn && today > p.endsOn) return "Ce code promo a expiré";
  if (p.maxUses != null && p.usedCount >= p.maxUses) return "Ce code promo a atteint son nombre maximal d'utilisations";
  if (base !== undefined && p.minPurchase != null && p.minPurchase > 0 && base < p.minPurchase) return `Ce code promo demande un achat d'au moins ${formatMoney(p.minPurchase, currency)}`;
  return null;
}

/** Libellé court : « −10 % » ou « −2 000 FCFA ». */
export function promoLabel(p: { kind: string; value: number }, fmt: (v: number) => string) {
  return p.kind === "percent" ? `−${p.value} %` : `−${fmt(p.value)}`;
}
