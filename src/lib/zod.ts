import { z } from "zod";

// Messages de validation en français partout (« nombre attendu »…)
z.config(z.locales.fr());

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

/** Noms des champs tels que l'utilisateur les voit, pour des erreurs lisibles. */
const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  companyName: "Nom de l'entreprise",
  ownerName: "Responsable",
  fullName: "Nom",
  email: "Email",
  password: "Mot de passe",
  phone: "Téléphone",
  salePrice: "Prix de vente",
  purchasePrice: "Prix d'achat",
  promoPrice: "Prix promo",
  minStock: "Stock minimum",
  initialStock: "Stock initial",
  quantity: "Quantité",
  unitPrice: "Prix unitaire",
  unitCost: "Coût unitaire",
  discount: "Remise",
  amount: "Montant",
  taxRate: "TVA",
  rate: "Taux",
  description: "Désignation",
  items: "Lignes",
  balanceDue: "Solde dû",
  creditLimit: "Plafond de crédit",
  spentOn: "Date",
  dueDate: "Échéance",
  months: "Nombre de mois",
  brandColor: "Couleur",
  country: "Pays",
  currency: "Devise",
  timezone: "Fuseau horaire",
};

export function zodMessage(e: z.ZodError) {
  return e.issues
    .map((i) => {
      const key = [...i.path].reverse().find((p) => typeof p === "string") as string | undefined;
      const line = i.path.find((p) => typeof p === "number") as number | undefined;
      const label = key ? (FIELD_LABELS[key] ?? null) : null;
      const where = label ? (line !== undefined ? `${label} (ligne ${line + 1})` : label) : null;
      return where ? `${where} : ${i.message}` : i.message;
    })
    .join(" · ");
}
