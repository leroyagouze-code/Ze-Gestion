import { and, count, eq, inArray } from "drizzle-orm";
import { AppShell } from "@/components/shell";
import type { NavItem } from "@/components/nav";
import { db } from "@/db";
import { disputes, leases, properties, requests, units } from "@/db/schema";
import { t } from "@/i18n";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { propertyScope } from "@/modules/access";
import { unreadCount } from "@/modules/notifications/service";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const scopedLeases = db
    .select({ id: leases.id })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(propertyScope(ctx));
  const [unread, [openDisputes], [openRequests]] = await Promise.all([
    unreadCount(ctx.userId),
    db.select({ n: count() }).from(disputes).where(and(eq(disputes.status, "OPEN"), inArray(disputes.leaseId, scopedLeases))),
    db.select({ n: count() }).from(requests).where(and(eq(requests.status, "OPEN"), inArray(requests.leaseId, scopedLeases))),
  ]);
  const p = ctx.permissions;
  const bottom: NavItem[] = [
    { href: "/tableau-de-bord", label: t("nav.home"), icon: "home" },
    { href: "/biens", label: t("nav.properties"), icon: "building" },
    { href: "/locataires", label: t("nav.tenants"), short: "Locataires", icon: "users" },
    { href: "/paiements", label: t("nav.payments"), icon: "wallet" },
    { href: "/rapports", label: t("nav.reports"), icon: "chart" },
    { href: "/parametres", label: t("nav.settings"), short: "Réglages", icon: "settings", badge: openDisputes.n + openRequests.n || undefined },
  ];
  const side: NavItem[] = [
    ...bottom.slice(0, 4),
    { href: "/impayes", label: t("nav.arrears"), icon: "alert" },
    bottom[4],
    { href: "/contestations", label: t("nav.disputes"), icon: "dispute", badge: openDisputes.n || undefined },
    { href: "/demandes", label: t("nav.requests"), icon: "wrench", badge: openRequests.n || undefined },
    ...(ctx.orgKind === "AGENCY" && can(p, "owner.manage") ? [{ href: "/proprietaires", label: t("nav.owners"), icon: "owner" as const }] : []),
    ...(can(p, "audit.read") ? [{ href: "/journal", label: t("nav.audit"), icon: "history" as const }] : []),
    { ...bottom[5], badge: undefined },
  ];
  return (
    <AppShell
      homeHref="/tableau-de-bord"
      spaceLabel={ctx.orgName}
      userName={ctx.userName}
      unread={unread}
      notificationsHref="/notifications"
      profileHref="/parametres"
      bottomItems={bottom}
      sideItems={side}
    >
      {children}
    </AppShell>
  );
}
