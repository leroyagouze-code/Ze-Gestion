import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { num } from "@/lib/zod";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { auditLogs, companies, plans, subscriptionPayments, subscriptions, users } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { contains } from "@/lib/search";
import { computeState } from "@/modules/billing/access";

/**
 * Espace super admin : ne lit que les tables plateforme (entreprises, utilisateurs, formules,
 * abonnements, paiements d'abonnement). Il n'a pas accès aux données commerciales (RLS) ;
 * chacune de ses actions est inscrite au journal de l'entreprise concernée.
 */
type Admin = { userId: string; isSuperAdmin: boolean };

function assertSuperAdmin(u: { isSuperAdmin: boolean }) {
  if (!u.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
}

async function logAction(tx: Tx, admin: Admin, companyId: string, action: string, metadata?: Record<string, unknown>) {
  await tx.execute(sql`select set_config('app.user_id', ${admin.userId}, true)`);
  await tx.insert(auditLogs).values({ companyId, userId: admin.userId, action, entityType: "company", entityId: companyId, metadata });
}

/* ─────────── Catégories d'abonnement (mêmes règles que billing/access) ─────────── */

const s = subscriptions;
const periodOpen = sql`(${s.currentPeriodEnd} is null or ${s.currentPeriodEnd} > now())`;
export const SUBSCRIPTION_FILTERS = {
  all: { label: "Toutes", where: undefined },
  trial: { label: "En essai", where: sql`not ${s.unlimited} and ${s.status} = 'trialing' and ${s.trialEndsAt} > now()` },
  paid: { label: "Payantes", where: sql`not ${s.unlimited} and ${s.status} = 'active' and ${periodOpen}` },
  expiring: {
    label: "Expirent sous 7 j",
    where: sql`not ${s.unlimited} and ${s.status} = 'active' and ${s.currentPeriodEnd} > now() and ${s.currentPeriodEnd} <= now() + interval '7 days'`,
  },
  unlimited: { label: "Accès offert", where: sql`${s.unlimited}` },
  readonly: {
    label: "Lecture seule",
    where: sql`not ${s.unlimited} and ((${s.status} = 'trialing' and ${s.trialEndsAt} <= now()) or (${s.status} = 'active' and ${s.currentPeriodEnd} <= now()) or ${s.status} in ('past_due', 'suspended', 'canceled'))`,
  },
  suspended: { label: "Entreprises suspendues", where: sql`${companies.status} = 'suspended'` },
} satisfies Record<string, { label: string; where: SQL | undefined }>;
export type SubscriptionFilter = keyof typeof SUBSCRIPTION_FILTERS;

export async function platformOverview(admin: Admin) {
  assertSuperAdmin(admin);
  const counts = Object.fromEntries(
    await Promise.all(
      Object.entries(SUBSCRIPTION_FILTERS).map(async ([key, f]) => {
        const [r] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(companies)
          .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
          .where(f.where);
        return [key, r.n];
      }),
    ),
  ) as Record<SubscriptionFilter, number>;
  // Revenu mensuel récurrent : prix mensuel des abonnements payants en cours
  const [mrr] = await db
    .select({ v: sql<number>`coalesce(sum(${plans.monthlyPrice}), 0)::float8` })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(SUBSCRIPTION_FILTERS.paid.where);
  const [cashed] = await db
    .select({ v: sql<number>`coalesce(sum(${subscriptionPayments.amount}), 0)::float8` })
    .from(subscriptionPayments)
    .where(sql`${subscriptionPayments.createdAt} > now() - interval '30 days'`);
  const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const [last30] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(sql`${companies.createdAt} > now() - interval '30 days'`);
  return { counts, mrr: mrr.v, cashed30: cashed.v, users: u.n, signups30: last30.n };
}

const PAGE = 50;

export async function listCompanies(admin: Admin, opts: { q?: string; filter?: string; page?: number }) {
  assertSuperAdmin(admin);
  const filter = (opts.filter && opts.filter in SUBSCRIPTION_FILTERS ? opts.filter : "all") as SubscriptionFilter;
  const page = Math.max(1, Number(opts.page) || 1);
  const conds: SQL[] = [];
  const f = SUBSCRIPTION_FILTERS[filter].where;
  if (f) conds.push(f);
  const q = opts.q?.trim();
  if (q) conds.push(or(ilike(companies.name, contains(q)), ilike(companies.email, contains(q)), ilike(companies.phone, contains(q)))!);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      email: companies.email,
      phone: companies.phone,
      city: companies.city,
      country: companies.country,
      status: companies.status,
      createdAt: companies.createdAt,
      plan: plans.name,
      subStatus: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      unlimited: subscriptions.unlimited,
    })
    .from(companies)
    .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)
    .orderBy(desc(companies.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(companies)
    .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
    .where(where);
  return {
    rows: rows.map((r) => ({
      ...r,
      state: r.subStatus
        ? computeState({ status: r.subStatus, trialEndsAt: r.trialEndsAt, currentPeriodEnd: r.currentPeriodEnd, unlimited: r.unlimited ?? false, planName: r.plan ?? "" })
        : null,
    })),
    total,
    page,
    pageSize: PAGE,
    filter,
  };
}

export async function getCompanyAdmin(admin: Admin, companyId: string) {
  assertSuperAdmin(admin);
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new NotFoundError("Entreprise");
  const [sub] = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .limit(1);
  const payments = await db
    .select({ payment: subscriptionPayments, plan: plans.name, recordedBy: users.fullName })
    .from(subscriptionPayments)
    .innerJoin(plans, eq(plans.id, subscriptionPayments.planId))
    .leftJoin(users, eq(users.id, subscriptionPayments.recordedBy))
    .where(eq(subscriptionPayments.companyId, companyId))
    .orderBy(desc(subscriptionPayments.createdAt))
    .limit(100);
  const state = sub
    ? computeState({ status: sub.sub.status, trialEndsAt: sub.sub.trialEndsAt, currentPeriodEnd: sub.sub.currentPeriodEnd, unlimited: sub.sub.unlimited, planName: sub.plan.name })
    : null;
  return { company, subscription: sub?.sub ?? null, plan: sub?.plan ?? null, state, payments, plans: await db.select().from(plans).orderBy(plans.monthlyPrice) };
}

async function lockSubscription(tx: Tx, companyId: string) {
  const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1).for("update");
  if (!sub) throw new BusinessError("Aucun abonnement pour cette entreprise");
  return sub;
}

/* ─────────── Actions ─────────── */

export const PAYMENT_METHODS = { tmoney: "TMoney", flooz: "Flooz", cash: "Espèces", transfer: "Virement", card: "Carte", other: "Autre" } as const;

export const paymentSchema = z.object({
  planId: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(36),
  amount: num().pipe(z.number().max(100_000_000)),
  method: z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS, ...(keyof typeof PAYMENT_METHODS)[]]),
  reference: z.string().trim().max(100).optional().transform((v) => v || null),
});

const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
};

/**
 * Enregistre un paiement reçu et active (ou prolonge) l'abonnement payant.
 * Une période encore en cours est prolongée à partir de sa fin ; sinon elle démarre maintenant.
 */
export async function recordSubscriptionPayment(admin: Admin, companyId: string, raw: unknown) {
  assertSuperAdmin(admin);
  const input = paymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId);
    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId));
    if (!plan) throw new NotFoundError("Formule");
    const now = new Date();
    const running = sub.status === "active" && !sub.unlimited && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const periodStart = running ? sub.currentPeriodEnd! : now;
    const periodEnd = addMonths(periodStart, input.months);
    await tx.insert(subscriptionPayments).values({
      companyId,
      planId: plan.id,
      amount: input.amount,
      currency: plan.currency,
      method: input.method,
      reference: input.reference,
      months: input.months,
      periodStart,
      periodEnd,
      recordedBy: admin.userId,
    });
    await tx
      .update(subscriptions)
      .set({ planId: plan.id, status: "active", unlimited: false, currentPeriodEnd: periodEnd, updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    await logAction(tx, admin, companyId, "platform.payment_recorded", { plan: plan.name, amount: input.amount, method: input.method, months: input.months, periodEnd });
    return periodEnd;
  });
}

/**
 * Accès illimité offert (partenaire, test, compte interne) : plus de date de fin ni de limite de formule.
 * Le retirer remet l'entreprise sur sa période payée ; sans période en cours, elle passe en lecture seule.
 */
export async function setUnlimited(admin: Admin, companyId: string, unlimited: boolean, note?: string | null) {
  assertSuperAdmin(admin);
  await db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId);
    const now = new Date();
    const patch = unlimited
      ? { unlimited: true, status: "active" as const, notes: note?.trim() || sub.notes }
      : { unlimited: false, status: "active" as const, currentPeriodEnd: sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now };
    await tx.update(subscriptions).set({ ...patch, updatedAt: now }).where(eq(subscriptions.id, sub.id));
    await logAction(tx, admin, companyId, unlimited ? "platform.unlimited_granted" : "platform.unlimited_removed", note ? { note } : undefined);
  });
}

export const FREE_DURATIONS = { "1": "1 mois", "3": "3 mois", "6": "6 mois", "12": "1 an", unlimited: "Sans limite" } as const;

export const freeAccessSchema = z.object({
  duration: z.enum(Object.keys(FREE_DURATIONS) as [keyof typeof FREE_DURATIONS, ...(keyof typeof FREE_DURATIONS)[]]),
  planId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

/**
 * Activation gratuite par le super admin : accès complet pendant la durée choisie (ajoutée à une
 * période en cours), ou sans limite. Aucun paiement n'est enregistré ; l'action est journalisée.
 */
export async function grantFreeAccess(admin: Admin, companyId: string, raw: unknown) {
  assertSuperAdmin(admin);
  const input = freeAccessSchema.parse(raw);
  if (input.duration === "unlimited") {
    await setUnlimited(admin, companyId, true, input.note ?? "Accès gratuit");
    if (input.planId) await setCompanyPlan(admin, companyId, input.planId);
    return null;
  }
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId);
    if (input.planId) {
      const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId));
      if (!plan) throw new NotFoundError("Formule");
    }
    const now = new Date();
    const running = sub.status === "active" && !sub.unlimited && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const periodEnd = addMonths(running ? sub.currentPeriodEnd! : now, Number(input.duration));
    await tx
      .update(subscriptions)
      .set({ status: "active", unlimited: false, currentPeriodEnd: periodEnd, ...(input.planId ? { planId: input.planId } : {}), notes: input.note ?? sub.notes, updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    await logAction(tx, admin, companyId, "platform.free_access", { months: Number(input.duration), periodEnd, note: input.note });
    return periodEnd;
  });
}

/** Prolonge l'essai (ou le rouvre s'il est terminé) : la société repasse en accès complet. */
export async function extendTrial(admin: Admin, companyId: string, days = 14) {
  assertSuperAdmin(admin);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new BusinessError("Durée invalide");
  await db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId);
    if (sub.unlimited || (sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date())) {
      throw new BusinessError("Cette entreprise a déjà un accès actif");
    }
    const from = Math.max(Date.now(), sub.status === "trialing" ? (sub.trialEndsAt?.getTime() ?? 0) : 0);
    const trialEndsAt = new Date(from + days * 86_400_000);
    await tx.update(subscriptions).set({ status: "trialing", trialEndsAt, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await logAction(tx, admin, companyId, "platform.trial_extended", { days, trialEndsAt });
  });
}

/** Change la formule (limites) sans toucher aux dates : l'activation passe par un paiement ou un accès offert. */
export async function setCompanyPlan(admin: Admin, companyId: string, planId: string) {
  assertSuperAdmin(admin);
  await db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId);
    const [plan] = await tx.select({ id: plans.id, name: plans.name }).from(plans).where(eq(plans.id, planId));
    if (!plan) throw new NotFoundError("Formule");
    await tx.update(subscriptions).set({ planId, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await logAction(tx, admin, companyId, "platform.plan_changed", { plan: plan.name });
  });
}

export async function setCompanyStatus(admin: Admin, companyId: string, status: "active" | "suspended") {
  assertSuperAdmin(admin);
  await db.transaction(async (tx) => {
    const res = await tx.update(companies).set({ status, updatedAt: new Date() }).where(eq(companies.id, companyId)).returning({ id: companies.id });
    if (!res.length) throw new NotFoundError("Entreprise");
    await logAction(tx, admin, companyId, `platform.company_${status}`);
  });
}
