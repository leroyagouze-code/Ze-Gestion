import { z } from "zod";
import { isISODate } from "@/modules/finance/dates";
import { normalizePhone } from "./phone";

/** Champ texte facultatif : "" → null */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (${max} caractères maximum)`)
    .nullish()
    .transform((v) => (v ? v : null));

export const reqText = (label: string, max = 200) =>
  z.string({ message: `${label} obligatoire` }).trim().min(1, `${label} obligatoire`).max(max, `${label} trop long`);

export const uuid = z.string().uuid("Identifiant invalide");

export const optUuid = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

/** Montant en FCFA ("75 000" accepté), entier */
export const amount = (label = "Montant", opts: { min?: number; allowNegative?: boolean } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[\s  ]/g, "").replace(",", ".")) : v),
    z
      .number({ message: `${label} invalide` })
      .finite(`${label} invalide`)
      .int(`${label} : sans centimes`)
      .min(opts.allowNegative ? -1e12 : (opts.min ?? 0), `${label} trop petit`)
      .max(1e12, `${label} trop grand`),
  );

export const isoDate = (label = "Date") => z.string({ message: `${label} obligatoire` }).refine(isISODate, `${label} invalide`);

export const optIsoDate = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), "Date invalide");

export const phone = z
  .string({ message: "Téléphone obligatoire" })
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide (ex. 90 12 34 56)" });
      return z.NEVER;
    }
    return p;
  });

export const optEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.string().email("Email invalide").nullable());

export function formToObject(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
}

export function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => i.message).join(" · ");
}
