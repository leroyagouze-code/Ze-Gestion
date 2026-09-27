import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appInstalls, companies, licenseIssues, licenseOrders, subscriptionPayments } from "@/db/schema";
import { BusinessError } from "@/lib/errors";
import { platformOverview } from "@/modules/admin/service";
import { listInstalls } from "@/modules/installs/service";
import { paymentMode } from "@/modules/billing/paygate";

/**
 * Tableau de bord général du super admin : la version en ligne (entreprises, abonnements),
 * le logiciel Windows (installations, licences) et l'argent encaissé, sur une seule page.
 */

type Admin = { userId: string; isSuperAdmin: boolean };

export type ActivityItem = { at: Date; kind: "signup" | "subscription" | "order" | "install"; title: string; detail: string; href?: string; tone?: "green" | "amber" | "red" | "gray" };

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

export async function globalOverview(admin: Admin) {
  if (!admin.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
  const [online, installs] = await Promise.all([platformOverview(admin), listInstalls(5000)]);

  const [orders30] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${licenseOrders.status} = 'paid')::int`,
      amount: sql<number>`coalesce(sum(${licenseOrders.amount}) filter (where ${licenseOrders.status} = 'paid'), 0)::float8`,
      failed: sql<number>`count(*) filter (where ${licenseOrders.status} = 'failed')::int`,
    })
    .from(licenseOrders)
    .where(gt(licenseOrders.createdAt, sql`now() - interval '30 days'`));
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(licenseOrders)
    .where(and(eq(licenseOrders.status, "pending"), gt(licenseOrders.createdAt, sql`now() - interval '2 days'`)));
  const byPlan = await db
    .select({ plan: licenseIssues.plan, n: sql<number>`count(distinct ${licenseIssues.installId})::int` })
    .from(licenseIssues)
    .where(sql`${licenseIssues.expiresAt} is null or ${licenseIssues.expiresAt} > now()`)
    .groupBy(licenseIssues.plan);
  // Licences qui expirent sous 30 jours, sans licence plus récente sur le même poste
  const expiring = await db.execute<{ install_id: string; plan: string; expires_at: Date; customer: string | null }>(sql`
    select distinct on (install_id) install_id, plan, expires_at, customer
    from ${licenseIssues}
    order by install_id, created_at desc`);
  const soon = expiring.rows
    .filter((r) => r.expires_at && new Date(r.expires_at).getTime() > Date.now() && new Date(r.expires_at).getTime() < Date.now() + 30 * 86_400_000)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());

  // Encaissements des 6 derniers mois : abonnements en ligne + licences du logiciel
  const months = await db.execute<{ month: string; subs: number; licences: number }>(sql`
    with m as (select generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') as month)
    select to_char(m.month, 'YYYY-MM-01') as month,
      coalesce((select sum(amount) from ${subscriptionPayments} where date_trunc('month', created_at) = m.month), 0)::float8 as subs,
      coalesce((select sum(amount) from ${licenseOrders} where status = 'paid' and date_trunc('month', paid_at) = m.month), 0)::float8 as licences
    from m order by m.month`);
  const revenue = months.rows.map((r) => ({ label: MONTH_LABEL.format(new Date(r.month)), subs: Number(r.subs), licences: Number(r.licences) }));

  // Poste « avec licence » : licence valable enregistrée ici, ou signalée par le logiciel lui-même
  const valid = new Set(expiring.rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now()).map((r) => r.install_id));
  const licensed = installs.rows.filter((r) => r.licensed || valid.has(r.installId)).length;
  const activity = await recentActivity();
  const versions = [...installs.rows.reduce((m, r) => m.set(r.version ?? "?", (m.get(r.version ?? "?") ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) =>
    b[0].localeCompare(a[0], undefined, { numeric: true }),
  );

  return {
    online,
    desktop: {
      total: installs.total,
      active7: installs.active7,
      active30: installs.active30,
      licensed,
      new30: installs.rows.filter((r) => r.firstSeenAt.getTime() > Date.now() - 30 * 86_400_000).length,
      byCountry: installs.byCountry.slice(0, 6),
      versions: versions.slice(0, 4),
    },
    licences: {
      paid30: orders30.paid,
      amount30: orders30.amount,
      failed30: orders30.failed,
      pending: pending.n,
      byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r.n])) as Record<string, number>,
      expiringSoon: soon.slice(0, 5),
      expiringCount: soon.length,
      mode: paymentMode(),
      canIssue: !!process.env.LICENSE_PRIVATE_KEY,
    },
    revenue,
    cashed30: online.cashed30 + orders30.amount,
    activity,
  };
}

async function recentActivity(limit = 12): Promise<ActivityItem[]> {
  const [signups, payments, orders, installs] = await Promise.all([
    db.select({ id: companies.id, name: companies.name, city: companies.city, at: companies.createdAt }).from(companies).orderBy(desc(companies.createdAt)).limit(limit),
    db
      .select({ companyId: subscriptionPayments.companyId, name: companies.name, amount: subscriptionPayments.amount, months: subscriptionPayments.months, method: subscriptionPayments.method, at: subscriptionPayments.createdAt })
      .from(subscriptionPayments)
      .innerJoin(companies, eq(companies.id, subscriptionPayments.companyId))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(limit),
    db.select().from(licenseOrders).orderBy(desc(licenseOrders.createdAt)).limit(limit),
    db.select().from(appInstalls).orderBy(desc(appInstalls.firstSeenAt)).limit(limit),
  ]);
  const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
  const items: ActivityItem[] = [
    ...signups.map((c) => ({ at: c.at, kind: "signup" as const, title: `Inscription : ${c.name}`, detail: c.city ?? "Version en ligne", href: `/admin/companies/${c.id}` })),
    ...payments.map((p) => ({
      at: p.at,
      kind: "subscription" as const,
      title: `Abonnement payé : ${p.name}`,
      detail: `${fcfa(p.amount)} · ${p.months} mois · ${p.method}`,
      href: `/admin/companies/${p.companyId}`,
      tone: "green" as const,
    })),
    ...orders.map((o) => ({
      at: o.paidAt ?? o.createdAt,
      kind: "order" as const,
      title: `${o.status === "paid" ? "Licence vendue" : o.status === "pending" ? "Achat de licence en cours" : "Achat de licence échoué"} : ${o.customerName}`,
      detail: `${o.plan} · ${fcfa(o.amount)} · poste ${o.installId}${o.provider === "simulation" ? " · test" : ""}`,
      href: "/admin/licences",
      tone: o.status === "paid" ? ("green" as const) : o.status === "pending" ? ("amber" as const) : ("red" as const),
    })),
    ...installs.map((i) => ({
      at: i.firstSeenAt,
      kind: "install" as const,
      title: `Nouvelle installation : ${i.companyName ?? i.installId}`,
      detail: [i.country, i.version ? `v${i.version}` : null, i.os].filter(Boolean).join(" · "),
      href: "/admin/installations",
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Entreprises dont l'abonnement payé se termine sous 7 jours, pour la relance. */
export async function expiringSubscriptions() {
  return db.execute<{ id: string; name: string; phone: string | null; end: Date }>(sql`
    select c.id, c.name, c.phone, s.current_period_end as end
    from companies c join subscriptions s on s.company_id = c.id
    where not s.unlimited and s.status = 'active' and s.current_period_end > now() and s.current_period_end <= now() + interval '7 days'
    order by s.current_period_end limit 5`);
}
