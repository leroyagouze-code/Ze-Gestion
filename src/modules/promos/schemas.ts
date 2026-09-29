import { z } from "zod";
import { normalizePromoCode } from "@/lib/promo";
import { optNum } from "@/lib/zod";

const dateField = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable());

/** Champs communs du formulaire de code promo (plateforme et entreprise). */
export const promoBaseSchema = z
  .object({
    code: z
      .string()
      .transform(normalizePromoCode)
      .pipe(z.string().regex(/^[A-Z0-9_-]{3,30}$/, "Code : 3 à 30 lettres, chiffres, - ou _")),
    description: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => v || null),
    kind: z.enum(["percent", "amount"], { message: "Type de réduction invalide" }),
    value: z.preprocess(
      (v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v),
      z.number({ message: "Valeur invalide" }).finite().positive("La réduction doit être positive").max(100_000_000),
    ),
    startsOn: dateField,
    endsOn: dateField,
    maxUses: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
      z.number().int("Nombre entier").min(1, "Au moins 1 utilisation").max(1_000_000).nullable(),
    ),
    isActive: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  })
  .refine((p) => p.kind !== "percent" || p.value <= 100, { message: "Un pourcentage ne dépasse pas 100", path: ["value"] })
  .refine((p) => !p.startsOn || !p.endsOn || p.startsOn <= p.endsOn, { message: "La date de fin précède la date de début", path: ["endsOn"] });

export const minPurchaseField = optNum.transform((v) => (v ? v : null));
