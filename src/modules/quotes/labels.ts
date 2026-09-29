/** Statuts affichés d'une proforma (« Expirée » est calculé, voir quoteDisplayStatus). */
export const QUOTE_STATUS = {
  draft: { label: "Brouillon", tone: "gray" },
  sent: { label: "Envoyée", tone: "blue" },
  accepted: { label: "Acceptée", tone: "green" },
  refused: { label: "Refusée", tone: "red" },
  expired: { label: "Expirée", tone: "amber" },
  converted: { label: "Convertie en facture", tone: "green" },
} as const;

export type QuoteDisplayStatus = keyof typeof QUOTE_STATUS;
export const isQuoteDisplayStatus = (v: unknown): v is QuoteDisplayStatus => typeof v === "string" && v in QUOTE_STATUS;

/** Mention portée par le PDF et la page publique : une proforma n'est pas une facture. */
export const PROFORMA_NOTICE = "Ce document est une facture proforma : il ne constitue pas une facture. La facture définitive sera établie après acceptation de l'offre.";

/** Durée de validité par défaut d'une proforma. */
export const QUOTE_VALIDITY_DAYS = 30;

/**
 * Une proforma en brouillon ou envoyée dont la date de validité est passée est « expirée ».
 * Acceptée, refusée ou convertie, elle garde son statut. today : date locale de l'entreprise (YYYY-MM-DD).
 */
export function quoteDisplayStatus(q: { status: string; validUntil: string }, today: string): QuoteDisplayStatus {
  if ((q.status === "draft" || q.status === "sent") && q.validUntil < today) return "expired";
  return isQuoteDisplayStatus(q.status) ? q.status : "draft";
}

/** Date YYYY-MM-DD décalée de n jours (calcul sur le calendrier, sans fuseau). */
export function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
