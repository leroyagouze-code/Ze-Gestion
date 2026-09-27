import { AppShell, type NavItem } from "@/components/nav";
import { requireContext } from "@/lib/auth/server";
import type { AppContext } from "@/modules/auth/context";
import { formatDate } from "@/lib/dates";
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

const SUPPORT = process.env.SUPPORT_CONTACT ?? "notre équipe";

function SubscriptionBanner({ state, isAdmin }: { state: AppContext["subscription"]; isAdmin: boolean }) {
  if (state.readOnly) {
    return (
      <div className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <b>Compte en lecture seule.</b>{" "}
        {state.status === "trialing"
          ? "La période d'essai gratuite est terminée."
          : state.expired
            ? `L'abonnement a expiré le ${formatDate(state.periodEndsAt!)}.`
            : "L'abonnement n'est plus actif."}{" "}
        Vos données restent
        consultables et exportables, mais les ventes et les modifications sont suspendues. Pour choisir une formule, contactez {SUPPORT}.
      </div>
    );
  }
  // Rappel pendant la dernière semaine d'essai, pour l'administrateur seulement
  if (isAdmin && state.trialDaysLeft !== null && state.trialDaysLeft <= 7) {
    return (
      <div className="no-print mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        Essai gratuit : {state.trialDaysLeft === 1 ? "dernier jour" : `${state.trialDaysLeft} jours restants`}. Ensuite, le compte passera en
        lecture seule jusqu&apos;au choix d&apos;une formule. Contactez {SUPPORT}.
      </div>
    );
  }
  if (isAdmin && state.periodDaysLeft !== null && state.periodDaysLeft <= 7) {
    return (
      <div className="no-print mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        Votre abonnement {state.planName} se termine le {formatDate(state.periodEndsAt!)}. Pensez à le renouveler auprès de {SUPPORT} pour
        éviter le passage en lecture seule.
      </div>
    );
  }
  return null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const items: NavItem[] = NAV.filter((n) => !n.perm || can(ctx.permissions, n.perm)).map(({ href, label, icon }) => ({ href, label, icon }));
  if (ctx.user.isSuperAdmin) items.push({ href: "/admin", label: "Super admin", icon: "admin" });
  return (
    <AppShell items={items} companyName={ctx.company.name} userName={ctx.user.fullName} roleName={ctx.roleName} logoutAction={logoutAction}>
      <SubscriptionBanner state={ctx.subscription} isAdmin={ctx.isAdmin} />
      {children}
    </AppShell>
  );
}
