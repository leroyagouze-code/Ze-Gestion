/**
 * Modules que l'entreprise peut masquer du menu pour garder une application simple
 * (ex. un commerçant qui ne fait que vendre). Tout est affiché par défaut ; masquer
 * un module ne supprime aucune donnée et ne change pas les droits des utilisateurs.
 * Tableau de bord, utilisateurs, paramètres et journal restent toujours visibles.
 */
export const MODULES = {
  pos: { href: "/pos", label: "Caisse", hint: "Vente au comptoir et tickets" },
  sales: { href: "/sales", label: "Ventes", hint: "Historique des ventes de caisse" },
  invoices: { href: "/invoices", label: "Factures", hint: "Factures manuelles et paiements" },
  products: { href: "/products", label: "Produits", hint: "Catalogue et prix" },
  stock: { href: "/stock", label: "Stock", hint: "Entrées, sorties, inventaire" },
  customers: { href: "/customers", label: "Clients", hint: "Fiches clients et crédits" },
  suppliers: { href: "/suppliers", label: "Fournisseurs", hint: "Fiches fournisseurs" },
  expenses: { href: "/expenses", label: "Dépenses", hint: "Charges de l'entreprise" },
  reports: { href: "/reports", label: "Rapports", hint: "Chiffre d'affaires, TVA, marges" },
} as const;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const isModuleKey = (v: unknown): v is ModuleKey => typeof v === "string" && v in MODULES;

/** Le lien de menu est-il masqué par l'entreprise ? */
export function isHiddenHref(href: string, hidden: readonly string[] | null | undefined) {
  return !!hidden?.some((k) => isModuleKey(k) && MODULES[k].href === href);
}
