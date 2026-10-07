import { AppShell } from "@/components/shell";
import type { NavItem } from "@/components/nav";
import { t } from "@/i18n";
import { requireTenant } from "@/lib/auth/server";
import { unreadCount } from "@/modules/notifications/service";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const unread = await unreadCount(ctx.userId);
  const items: NavItem[] = [
    { href: "/mon-espace", label: t("nav.home"), icon: "home", exact: true },
    { href: "/mon-espace/carnet", label: t("nav.notebook"), short: "Carnet", icon: "book" },
    { href: "/mon-espace/quittances", label: t("nav.receipts"), short: "Reçus", icon: "receipt" },
    { href: "/mon-espace/documents", label: t("nav.documents"), short: "Contrat", icon: "file" },
    { href: "/mon-espace/demandes", label: t("nav.myRequests"), icon: "wrench" },
    { href: "/mon-espace/profil", label: t("nav.profile"), short: "Profil", icon: "profile" },
  ];
  return (
    <AppShell
      homeHref="/mon-espace"
      spaceLabel="Mon espace locataire"
      userName={ctx.userName}
      unread={unread}
      notificationsHref="/mon-espace/notifications"
      profileHref="/mon-espace/profil"
      bottomItems={items}
      sideItems={items}
    >
      {children}
    </AppShell>
  );
}
