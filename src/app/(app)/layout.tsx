import { AppShell, type NavItem } from "@/components/nav";
import { requireContext } from "@/lib/auth/server";
import { can, type Permission } from "@/lib/permissions";
import { logoutAction } from "../(auth)/actions";

const NAV: (NavItem & { perm?: Permission })[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard", perm: "dashboard.view" },
  { href: "/pos", label: "Caisse", icon: "pos", perm: "sales.create" },
  { href: "/sales", label: "Ventes", icon: "sales", perm: "sales.view" },
  { href: "/invoices", label: "Factures", icon: "invoices", perm: "invoices.view" },
  { href: "/products", label: "Produits", icon: "products", perm: "products.view" },
  { href: "/stock", label: "Stock", icon: "stock", perm: "stock.view" },
  { href: "/customers", label: "Clients", icon: "customers", perm: "customers.view" },
  { href: "/suppliers", label: "Fournisseurs", icon: "suppliers", perm: "suppliers.view" },
  { href: "/expenses", label: "Dépenses", icon: "expenses", perm: "expenses.view" },
  { href: "/reports", label: "Rapports", icon: "reports", perm: "reports.view" },
  { href: "/users", label: "Utilisateurs", icon: "users", perm: "users.manage" },
  { href: "/settings/company", label: "Paramètres", icon: "settings", perm: "settings.manage" },
  { href: "/audit", label: "Journal d'activité", icon: "audit", perm: "audit.view" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const items: NavItem[] = NAV.filter((n) => !n.perm || can(ctx.permissions, n.perm)).map(({ href, label, icon }) => ({ href, label, icon }));
  if (ctx.user.isSuperAdmin) items.push({ href: "/admin", label: "Super admin", icon: "admin" });
  return (
    <AppShell items={items} companyName={ctx.company.name} userName={ctx.user.fullName} roleName={ctx.roleName} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
