import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, companies, plans, subscriptions, users } from "@/db/schema";
import { BusinessError } from "@/lib/errors";

/**
 * Espace super admin : ne lit que les tables plateforme (companies, users, plans, subscriptions).
 * Il n'a pas accès aux données commerciales (RLS) ; ses actions sont tracées.
 */
function assertSuperAdmin(u: { isSuperAdmin: boolean }) {
  if (!u.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
}

export async function platformStats(u: { isSuperAdmin: boolean }) {
  assertSuperAdmin(u);
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${companies.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${companies.status} = 'suspended')::int`,
      last30: sql<number>`count(*) filter (where ${companies.createdAt} > now() - interval '30 days')::int`,
    })
    .from(companies);
  const [u2] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
  const byPlan = await db
    .select({
      plan: plans.name,
      count: sql<number>`count(${subscriptions.id})::int`,
      mrr: sql<number>`coalesce(sum(${plans.monthlyPrice}) filter (where ${subscriptions.status} = 'active'), 0)::float8`,
    })
    .from(plans)
    .leftJoin(subscriptions, eq(subscriptions.planId, plans.id))
    .groupBy(plans.id)
    .orderBy(plans.monthlyPrice);
  const recent = await db
    .select({
      id: companies.id,
      name: companies.name,
      email: companies.email,
      city: companies.city,
      country: companies.country,
      status: companies.status,
      createdAt: companies.createdAt,
      plan: plans.name,
      subStatus: subscriptions.status,
    })
    .from(companies)
    .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .orderBy(desc(companies.createdAt))
    .limit(100);
  return { companies: c, users: u2.total, byPlan, recent, plans: await db.select().from(plans).orderBy(plans.monthlyPrice) };
}

export async function setCompanyStatus(admin: { userId: string; isSuperAdmin: boolean }, companyId: string, status: "active" | "suspended") {
  assertSuperAdmin(admin);
  await db.transaction(async (tx) => {
    await tx.update(companies).set({ status, updatedAt: new Date() }).where(eq(companies.id, companyId));
    await tx.execute(sql`select set_config('app.user_id', ${admin.userId}, true)`);
    await tx.insert(auditLogs).values({ companyId, userId: admin.userId, action: `platform.company_${status}`, entityType: "company", entityId: companyId });
  });
}

export async function setCompanyPlan(admin: { userId: string; isSuperAdmin: boolean }, companyId: string, planId: string) {
  assertSuperAdmin(admin);
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
    if (existing) await tx.update(subscriptions).set({ planId, status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, existing.id));
    else await tx.insert(subscriptions).values({ companyId, planId, status: "active" });
    await tx.execute(sql`select set_config('app.user_id', ${admin.userId}, true)`);
    await tx.insert(auditLogs).values({ companyId, userId: admin.userId, action: "platform.plan_changed", entityType: "company", entityId: companyId, metadata: { planId } });
  });
}
