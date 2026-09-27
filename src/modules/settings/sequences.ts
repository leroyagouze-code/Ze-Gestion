import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { documentSequences } from "@/db/schema";

export type DocType = "invoice" | "sale" | "quote" | "delivery" | "purchase_order";

export const DEFAULT_SEQUENCES: { docType: DocType; prefix: string }[] = [
  { docType: "invoice", prefix: "FACT" },
  { docType: "sale", prefix: "VTE" },
  { docType: "quote", prefix: "DEV" },
  { docType: "delivery", prefix: "BL" },
  { docType: "purchase_order", prefix: "BC" },
];

export function formatNumber(pattern: string, prefix: string, year: number, seq: number, padding: number) {
  return pattern
    .replace("{PREFIX}", prefix)
    .replace("{YYYY}", String(year))
    .replace("{YY}", String(year).slice(-2))
    .replace("{SEQ}", String(seq).padStart(padding, "0"));
}

/**
 * Réserve le prochain numéro de document (FACT-2026-000001).
 * Verrou de ligne FOR UPDATE : deux caisses simultanées n'obtiennent jamais le même numéro.
 */
export async function nextDocumentNumber(tx: Tx, companyId: string, docType: DocType, now = new Date()) {
  const year = now.getFullYear();
  const [seq] = await tx
    .select()
    .from(documentSequences)
    .where(and(eq(documentSequences.companyId, companyId), eq(documentSequences.docType, docType)))
    .for("update");
  if (!seq) throw new Error(`Numérotation « ${docType} » non configurée`);
  const reset = seq.resetYearly && seq.currentYear !== year;
  const number = reset ? 1 : seq.nextNumber;
  await tx
    .update(documentSequences)
    .set({ nextNumber: number + 1, currentYear: year })
    .where(and(eq(documentSequences.companyId, companyId), eq(documentSequences.docType, docType)));
  return formatNumber(seq.pattern, seq.prefix, year, number, seq.padding);
}

