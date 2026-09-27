-- Accès par niveau : nouvelles permissions (remises, crédit, ventes de tous, ajout de clients, exports).
-- Les rôles existants gardent ce qu'ils pouvaient déjà faire, sauf le Caissier, restreint à la vente.
-- L'Administrateur reçoit toujours toutes les permissions à la connexion (voir loadContext).

-- Tous les rôles qui encaissaient gardent remises et crédit, sauf le Caissier par défaut.
UPDATE "roles" SET "permissions" = array_cat("permissions", ARRAY['sales.discount', 'sales.credit'])
WHERE 'sales.create' = ANY("permissions") AND NOT ("is_system" AND "name" = 'Caissier');
--> statement-breakpoint
-- Ceux qui consultaient les ventes voyaient celles de tout le monde : on le conserve, sauf pour le Caissier et le Commercial.
UPDATE "roles" SET "permissions" = array_append("permissions", 'sales.view_all')
WHERE 'sales.view' = ANY("permissions") AND NOT ("is_system" AND "name" IN ('Caissier', 'Commercial'));
--> statement-breakpoint
-- « Modifier les clients » incluait la création.
UPDATE "roles" SET "permissions" = array_append("permissions", 'customers.create')
WHERE 'customers.edit' = ANY("permissions");
--> statement-breakpoint
-- Exports CSV : réservés à ceux qui voient les rapports.
UPDATE "roles" SET "permissions" = array_append("permissions", 'data.export')
WHERE 'reports.view' = ANY("permissions");
--> statement-breakpoint
-- Caissier par défaut : vendre et consulter ses ventes, sans modifier les fiches clients ni voir les factures.
UPDATE "roles" SET "permissions" = ARRAY['sales.create', 'sales.view', 'products.view', 'customers.view', 'customers.create']
WHERE "is_system" AND "name" = 'Caissier';
--> statement-breakpoint
-- Administrateur : liste complète (l'application la complète de toute façon).
UPDATE "roles" SET "permissions" = ARRAY[
  'dashboard.view', 'reports.view', 'reports.profit', 'products.view', 'products.edit', 'products.delete', 'products.cost',
  'stock.view', 'stock.adjust', 'sales.create', 'sales.discount', 'sales.credit', 'sales.view', 'sales.view_all', 'sales.cancel',
  'invoices.view', 'invoices.create', 'invoices.cancel', 'customers.view', 'customers.create', 'customers.edit',
  'suppliers.view', 'suppliers.edit', 'expenses.view', 'expenses.edit', 'data.export', 'users.manage', 'settings.manage', 'audit.view'
]
WHERE "is_system" AND "name" = 'Administrateur';
