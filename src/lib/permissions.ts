export const PERMISSIONS = {
  "dashboard.view": "Voir le tableau de bord",
  "reports.view": "Voir les rapports",
  "reports.profit": "Voir les bénéfices et marges",
  "products.view": "Consulter les produits",
  "products.edit": "Créer / modifier les produits",
  "products.delete": "Supprimer des produits",
  "products.cost": "Voir / modifier les prix d'achat",
  "stock.view": "Consulter le stock",
  "stock.adjust": "Entrées, sorties et ajustements de stock",
  "sales.create": "Vendre (caisse)",
  "sales.view": "Consulter les ventes",
  "sales.cancel": "Annuler une vente",
  "invoices.view": "Consulter les factures",
  "invoices.create": "Créer des factures",
  "invoices.cancel": "Annuler une facture",
  "customers.view": "Consulter les clients",
  "customers.edit": "Créer / modifier les clients",
  "suppliers.view": "Consulter les fournisseurs",
  "suppliers.edit": "Créer / modifier les fournisseurs",
  "expenses.view": "Consulter les dépenses",
  "expenses.edit": "Enregistrer des dépenses",
  "users.manage": "Gérer les utilisateurs et rôles",
  "settings.manage": "Modifier les paramètres de l'entreprise",
  "audit.view": "Consulter le journal d'activité",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Général", permissions: ["dashboard.view", "reports.view", "reports.profit", "audit.view"] },
  { label: "Produits & stock", permissions: ["products.view", "products.edit", "products.delete", "products.cost", "stock.view", "stock.adjust"] },
  { label: "Ventes & factures", permissions: ["sales.create", "sales.view", "sales.cancel", "invoices.view", "invoices.create", "invoices.cancel"] },
  { label: "Tiers", permissions: ["customers.view", "customers.edit", "suppliers.view", "suppliers.edit"] },
  { label: "Finances", permissions: ["expenses.view", "expenses.edit"] },
  { label: "Administration", permissions: ["users.manage", "settings.manage"] },
];

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Administrateur", permissions: ALL_PERMISSIONS },
  {
    name: "Gérant",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "users.manage" && p !== "settings.manage"),
  },
  {
    name: "Caissier",
    permissions: ["sales.create", "sales.view", "products.view", "customers.view", "customers.edit", "invoices.view"],
  },
  {
    name: "Magasinier",
    permissions: ["dashboard.view", "products.view", "products.edit", "stock.view", "stock.adjust", "suppliers.view"],
  },
  {
    name: "Commercial",
    permissions: ["dashboard.view", "sales.create", "sales.view", "products.view", "customers.view", "customers.edit", "invoices.view", "invoices.create"],
  },
  {
    name: "Comptable",
    permissions: [
      "dashboard.view", "reports.view", "reports.profit", "products.view", "products.cost", "sales.view",
      "invoices.view", "customers.view", "suppliers.view", "expenses.view", "expenses.edit", "audit.view",
    ],
  },
];

export class ForbiddenError extends Error {
  constructor(public permission: string) {
    super(`Permission refusée : ${PERMISSIONS[permission as Permission] ?? permission}`);
  }
}

export function can(perms: readonly string[], p: Permission) {
  return perms.includes(p);
}

export function assertCan(perms: readonly string[], p: Permission) {
  if (!can(perms, p)) throw new ForbiddenError(p);
}
