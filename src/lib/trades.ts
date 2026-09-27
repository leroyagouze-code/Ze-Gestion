import { BusinessError } from "./errors";

/**
 * Métiers : le client choisit le sien à l'inscription (modifiable dans les paramètres).
 * Le métier adapte les mots, les champs des fiches articles et les menus ; la base
 * (caisse, stock, factures, clients, rapports) reste commune à tous.
 */

export type AttributeField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** Affiché dans la liste des articles et utilisé par la recherche. */
  listed?: boolean;
  type?: "text" | "number";
};

export type Trade = {
  label: string;
  description: string;
  /** Nom des articles : « Produits », « Pièces », « Véhicules »… */
  item: { one: string; many: string; new: string; create: string };
  units: string[];
  defaultUnit: string;
  /** Champs propres au métier, stockés dans products.attributes. */
  attributes: AttributeField[];
  /** Mettre en avant date de péremption et numéro de lot. */
  perishable?: boolean;
  /** Véhicules des clients et ordres de réparation. */
  workshop?: boolean;
  /** Chaque article est unique (quantité 1, suivi par numéro de châssis). */
  uniqueItems?: boolean;
};

const BASE_UNITS = ["pièce", "kg", "g", "litre", "carton", "sac", "paquet", "boîte", "mètre"];

export const TRADES = {
  general: {
    label: "Commerce général",
    description: "Tout type de commerce : caisse, stock, factures.",
    item: { one: "produit", many: "Produits", new: "Nouveau produit", create: "Créer le produit" },
    units: BASE_UNITS,
    defaultUnit: "pièce",
    attributes: [],
  },
  grocery: {
    label: "Alimentation générale",
    description: "Dates de péremption, numéros de lot, vente au poids et au carton.",
    item: { one: "produit", many: "Produits", new: "Nouveau produit", create: "Créer le produit" },
    units: ["pièce", "kg", "g", "litre", "carton", "sac", "paquet", "boîte", "bouteille", "casier"],
    defaultUnit: "pièce",
    attributes: [{ key: "lot", label: "Numéro de lot", placeholder: "Ex. L2409-17" }],
    perishable: true,
  },
  retail: {
    label: "Boutique d'articles",
    description: "Vêtements, chaussures, accessoires : taille, couleur, matière.",
    item: { one: "article", many: "Articles", new: "Nouvel article", create: "Créer l'article" },
    units: ["pièce", "paire", "lot", "carton", "mètre"],
    defaultUnit: "pièce",
    attributes: [
      { key: "size", label: "Taille / pointure", placeholder: "Ex. M, 42", listed: true },
      { key: "color", label: "Couleur", placeholder: "Ex. Noir", listed: true },
      { key: "material", label: "Matière", placeholder: "Ex. Coton" },
    ],
  },
  garage: {
    label: "Garage automobile",
    description: "Véhicules des clients, ordres de réparation, pièces et main-d'œuvre.",
    item: { one: "pièce", many: "Pièces", new: "Nouvelle pièce", create: "Créer la pièce" },
    units: ["pièce", "litre", "jeu", "kit", "mètre"],
    defaultUnit: "pièce",
    attributes: [
      { key: "oemRef", label: "Référence constructeur", placeholder: "Ex. 04465-0K240", listed: true },
      { key: "fits", label: "Véhicules compatibles", placeholder: "Ex. Toyota Hilux 2016-2022" },
    ],
    workshop: true,
  },
  dealer: {
    label: "Concessionnaire automobile",
    description: "Chaque voiture suivie à l'unité par son numéro de châssis.",
    item: { one: "véhicule", many: "Véhicules", new: "Nouveau véhicule", create: "Créer le véhicule" },
    units: ["véhicule"],
    defaultUnit: "véhicule",
    attributes: [
      { key: "vin", label: "Numéro de châssis (VIN)", placeholder: "17 caractères", required: true, listed: true },
      { key: "model", label: "Modèle", placeholder: "Ex. Corolla", listed: true },
      { key: "year", label: "Année", placeholder: "Ex. 2021", type: "number", listed: true },
      { key: "mileage", label: "Kilométrage", placeholder: "Ex. 45000", type: "number" },
      { key: "color", label: "Couleur", placeholder: "Ex. Gris" },
      { key: "fuel", label: "Carburant", placeholder: "Essence, Diesel…" },
      { key: "plate", label: "Immatriculation", placeholder: "Si déjà immatriculé" },
    ],
    uniqueItems: true,
  },
} satisfies Record<string, Trade>;

export type TradeKey = keyof typeof TRADES;
export const TRADE_KEYS = Object.keys(TRADES) as TradeKey[];

export function getTrade(key: string | null | undefined): Trade {
  return TRADES[(key ?? "general") as TradeKey] ?? TRADES.general;
}

export const isTradeKey = (v: unknown): v is TradeKey => typeof v === "string" && v in TRADES;

/** Garde uniquement les champs connus du métier, nettoyés ; signale les champs obligatoires manquants. */
export function cleanAttributes(trade: Trade, raw: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const f of trade.attributes) {
    const v = String(raw[`attr_${f.key}`] ?? raw[f.key] ?? "").trim().slice(0, 200);
    if (v) out[f.key] = f.key === "vin" ? v.toUpperCase().replace(/\s+/g, "") : v;
    else if (f.required) throw new BusinessError(`${f.label} requis`);
  }
  return out;
}

/** Texte court affiché sous le nom de l'article (ex. « M · Noir », « VIN … · Corolla · 2021 »). */
export function attributeSummary(trade: Trade, attrs: Record<string, string> | null | undefined) {
  if (!attrs) return "";
  return trade.attributes
    .filter((f) => f.listed && attrs[f.key])
    .map((f) => (f.key === "vin" ? `VIN ${attrs[f.key]}` : attrs[f.key]))
    .join(" · ");
}
