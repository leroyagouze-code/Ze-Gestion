import { z } from "zod";
import { num, optNum, optText, optUuid } from "@/lib/zod";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  reference: optText(100),
  sku: optText(100),
  barcode: optText(100),
  categoryName: optText(100),
  brandName: optText(100),
  description: optText(2000),
  imageUrl: optText(500),
  purchasePrice: num().default(0),
  salePrice: num(),
  promoPrice: optNum,
  taxId: optUuid,
  minStock: num().default(0),
  unit: z.string().trim().min(1).max(30).default("pièce"),
  supplierId: optUuid,
  expiryDate: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable()),
  initialStock: optNum,
  /** Champs du métier (clé → valeur), validés par cleanAttributes. Absent : inchangés. */
  attributes: z.record(z.string(), z.string()).optional(),
});
export type ProductInput = z.input<typeof productSchema>;
