import { z } from "zod";

/** Champs texte optionnels venant de formulaires : "" → null */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const optUuid = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

/** Nombre venant d'un formulaire ("1 500,50" accepté) */
export const num = (opts: { min?: number } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v),
    z.number({ message: "Nombre invalide" }).finite().min(opts.min ?? 0, "Valeur trop petite"),
  );

export const optNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v),
  z.number().finite().min(0).nullable(),
).optional();

export function formToObject(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
}

export function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")} : ${i.message}` : i.message)).join(" · ");
}
