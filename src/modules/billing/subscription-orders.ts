import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { auditLogs, plans, subscriptionOrders, subscriptionPayments, subscriptions, type PlanLimits } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { PUBLIC_INVALID, quotePublicPromo, releasePlatformPromo, reservePlatformPromo } from "@/modules/billing/platform-promos";
import { localPhone, NETWORKS, paygateStatus, paymentMode, requestPaygatePayment, type Network } from "@/modules/billing/paygate";

/**
 * Abonnement payé en ligne par le commerçant : il choisit sa formule et sa durée, paie par TMoney ou
 * Flooz, et l'abonnement est activé (ou prolongé) dès que PayGate confirme le paiement.
 */

/** Durées proposées : 12 mois au prix de 10. */
export const SUB_DURATIONS = {
  1: { label: "1 mois", factor: 1 },
  3: { label: "3 mois", factor: 3 },
  6: { label: "6 mois", factor: 6 },
  12: { label: "12 mois", factor: 10 },
} as const;
export type SubMonths = keyof typeof SUB_DURATIONS;
const MONTHS = Object.keys(SUB_DURATIONS).map(Number) as SubMonths[];

export const SUB_PLAN_CODES = ["BASIC", "PRO", "BUSINESS"] as const;

export const subPrice = (monthly: number, months: SubMonths) => monthly * SUB_DURATIONS[months].factor;

/** Résumé lisible des limites d'une formule (page Tarifs et choix de la formule). */
export function planFeatures(l: PlanLimits) {
  const n = (v: number | null, one: string, many: string, unlimited: string) => (v === null ? unlimited : v === 1 ? `1 ${one}` : `${v.toLocaleString("fr-FR")} ${many}`);
  const f = new Set(l.features);
  return [
    n(l.maxUsers, "utilisateur", "utilisateurs", "Utilisateurs illimités"),
    n(l.maxProducts, "produit", "produits", "Produits illimités"),
    n(l.maxStores, "boutique", "boutiques", "Boutiques illimitées"),
    "Caisse, ventes, factures et tickets",
    f.has("reports") && "Rapports et bénéfices",
    f.has("import") && "Import de produits",
    f.has("quotes") && "Proformas",
    f.has("purchases") && "Achats fournisseurs",
    f.has("multistore") && "Plusieurs boutiques",
  ].filter(Boolean) as string[];
}

/** Formules payantes proposées, avec le prix de chaque durée. */
export async function listSubscriptionOffers() {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.isActive, true), inArray(plans.code, [...SUB_PLAN_CODES]), gt(plans.monthlyPrice, 0)))
    .orderBy(asc(plans.monthlyPrice));
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    currency: p.currency,
    monthlyPrice: p.monthlyPrice,
    features: planFeatures(p.limits),
    durations: MONTHS.map((m) => ({ months: m, label: SUB_DURATIONS[m].label, amount: subPrice(p.monthlyPrice, m) })),
  }));
}

/* ─────────── Commande ─────────── */

type Payer = { companyId: string; userId: string; isAdmin: boolean; isSuperAdmin?: boolean };

const monthsSchema = z.coerce
  .number()
  .int()
  .refine((m): m is SubMonths => m in SUB_DURATIONS, "Choisissez une durée");

export const subscriptionOrderSchema = z.object({
  plan: z.enum(SUB_PLAN_CODES, { message: "Choisissez une formule" }),
  months: monthsSchema,
  phone: z
    .string()
    .trim()
    .transform(localPhone)
    .pipe(z.string().regex(/^\d{8}$/, "Numéro à 8 chiffres, par exemple 90 12 34 56")),
  network: z.enum(Object.keys(NETWORKS) as [Network, ...Network[]], { message: "Choisissez TMoney ou Flooz" }),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
});

async function activePlan(code: string) {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.code, code), eq(plans.isActive, true), gt(plans.monthlyPrice, 0)));
  if (!plan || !SUB_PLAN_CODES.includes(plan.code as (typeof SUB_PLAN_CODES)[number])) throw new BusinessError("Cette formule n'est plus proposée");
  return plan;
}

/**
 * Le paiement en ligne est ouvert avec une clé PayGate. En mode test (simulation), seul le super admin
 * peut l'essayer sur le serveur en production : sinon n'importe qui s'offrirait un abonnement.
 */
export function canPayOnline(user: { isSuperAdmin?: boolean }) {
  const mode = paymentMode();
  if (mode === "paygate") return true;
  if (mode === "simulation") return process.env.NODE_ENV !== "production" || !!user.isSuperAdmin;
  return false;
}

function assertPayer(p: Payer) {
  if (!p.isAdmin) throw new BusinessError("Seul l'administrateur de l'entreprise peut payer l'abonnement");
}

/** Aperçu du prix avec un code promo (le prix payé est recalculé à la commande). */
export async function previewSubscriptionPromo(rawCode: string, planCode: string, rawMonths: unknown, meta: { ip?: string | null } = {}) {
  const months = monthsSchema.parse(rawMonths);
  const plan = await activePlan(planCode);
  const listAmount = subPrice(plan.monthlyPrice, months);
  const q = await quotePublicPromo(rawCode, { target: "subscription", plan: plan.code, amount: listAmount }, meta.ip);
  return { code: q.promo.code, listAmount, discount: q.discount, amount: q.amount, currency: plan.currency };
}

function newReference() {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return "ZA" + Array.from(randomBytes(8), (b) => A[b & 31]).join("");
}
export const SUB_REF = /^ZA[0-9A-Z]{8}$/;

async function failOrder(id: string, reason: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx
      .update(subscriptionOrders)
      .set({ status: "failed", failureReason: reason })
      .where(and(eq(subscriptionOrders.id, id), eq(subscriptionOrders.status, "pending")))
      .returning();
    if (f?.promoCodeId) await releasePlatformPromo(tx, f.promoCodeId);
    return f;
  });
}

export async function createSubscriptionOrder(payer: Payer, raw: unknown, meta: { ip?: string | null } = {}) {
  assertPayer(payer);
  const mode = paymentMode();
  if (!mode || !canPayOnline(payer)) throw new BusinessError("Le paiement en ligne n'est pas encore ouvert. Contactez ZE GROUP pour vous abonner.");
  const input = subscriptionOrderSchema.parse(raw);
  const plan = await activePlan(input.plan);
  const listAmount = subPrice(plan.monthlyPrice, input.months);
  // Prix payé calculé ici, depuis le tarif en base : le navigateur n'envoie que le code
  const quote = input.promoCode ? await quotePublicPromo(input.promoCode, { target: "subscription", plan: plan.code, amount: listAmount }, meta.ip) : null;
  const amount = quote ? quote.amount : listAmount;
  if (amount < 100) throw new BusinessError("Montant trop faible pour un paiement en ligne. Contactez ZE GROUP.");
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscriptionOrders)
    .where(and(eq(subscriptionOrders.companyId, payer.companyId), gt(subscriptionOrders.createdAt, sql`now() - interval '1 hour'`)));
  if (recent.n >= 5) throw new BusinessError("Trop de tentatives de paiement. Réessayez dans une heure.");

  const reference = newReference();
  const order = await db.transaction(async (tx) => {
    if (quote) await reservePlatformPromo(tx, quote.promo.id).catch(() => Promise.reject(new BusinessError(PUBLIC_INVALID)));
    const [o] = await tx
      .insert(subscriptionOrders)
      .values({
        reference,
        companyId: payer.companyId,
        userId: payer.userId,
        planId: plan.id,
        months: input.months,
        amount,
        listAmount,
        discountAmount: quote?.discount ?? 0,
        promoCodeId: quote?.promo.id ?? null,
        promoCode: quote?.promo.code ?? null,
        currency: plan.currency,
        phone: input.phone,
        network: input.network,
        provider: mode,
      })
      .returning();
    return o;
  });

  if (mode === "paygate") {
    const res = await requestPaygatePayment({
      reference,
      amount,
      phone: input.phone,
      network: input.network,
      description: `Abonnement ZE Gestion ${plan.name} ${SUB_DURATIONS[input.months].label}`,
    });
    if (res.ok) await db.update(subscriptionOrders).set({ providerRef: res.txReference }).where(eq(subscriptionOrders.id, order.id));
    else await failOrder(order.id, res.reason);
  }
  return reference;
}

const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
};

async function auditPaid(tx: Tx, companyId: string, userId: string | null, metadata: Record<string, unknown>) {
  if (userId) await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
  await tx.insert(auditLogs).values({ companyId, userId, action: "billing.subscription_paid", entityType: "company", entityId: companyId, metadata });
}

/**
 * Paiement confirmé : enregistre le paiement et active l'abonnement (une seule fois, même si la
 * confirmation arrive plusieurs fois). Une période en cours est prolongée à partir de sa fin.
 */
export async function fulfillSubscriptionOrder(reference: string, payment: { paymentRef?: string | null } = {}) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(subscriptionOrders).where(eq(subscriptionOrders.reference, reference)).for("update");
    if (!o) throw new NotFoundError("Commande");
    if (o.status === "paid") return o;
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.companyId, o.companyId)).limit(1).for("update");
    if (!sub) throw new BusinessError("Aucun abonnement pour cette entreprise");
    const [plan] = await tx.select({ name: plans.name }).from(plans).where(eq(plans.id, o.planId));
    const now = new Date();
    const running = sub.status === "active" && !sub.unlimited && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const periodStart = running ? sub.currentPeriodEnd! : now;
    const periodEnd = addMonths(periodStart, o.months);
    const paymentRef = payment.paymentRef ?? o.paymentRef;
    const [pay] = await tx
      .insert(subscriptionPayments)
      .values({
        companyId: o.companyId,
        planId: o.planId,
        amount: o.amount,
        promoCodeId: o.promoCodeId,
        promoCode: o.promoCode,
        discountAmount: o.discountAmount,
        currency: o.currency,
        method: o.provider === "simulation" ? "other" : o.network.toLowerCase(),
        reference: `${o.reference}${paymentRef ? ` · ${paymentRef}` : ""}`,
        months: o.months,
        periodStart,
        periodEnd,
        recordedBy: null,
      })
      .returning({ id: subscriptionPayments.id });
    // Un accès offert reste offert : le paiement est enregistré sans toucher à la date
    if (!sub.unlimited) {
      await tx
        .update(subscriptions)
        .set({ planId: o.planId, status: "active", currentPeriodEnd: periodEnd, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
    }
    await auditPaid(tx, o.companyId, o.userId, { plan: plan?.name, amount: o.amount, months: o.months, periodEnd, reference: o.reference, ...(o.promoCode ? { promoCode: o.promoCode } : {}) });
    const [paid] = await tx
      .update(subscriptionOrders)
      .set({ status: "paid", paidAt: now, paymentRef, paymentId: pay.id, failureReason: null })
      .where(eq(subscriptionOrders.id, o.id))
      .returning();
    return paid;
  });
}

/** Met à jour une commande en attente en demandant son statut à PayGate (au plus toutes les 5 secondes). */
export async function refreshSubscriptionOrder(reference: string, opts: { force?: boolean } = {}) {
  const [o] = await db.select().from(subscriptionOrders).where(eq(subscriptionOrders.reference, reference));
  if (!o) throw new NotFoundError("Commande");
  if (o.status !== "pending" || o.provider !== "paygate" || paymentMode() !== "paygate") return o;
  if (!opts.force && o.checkedAt && Date.now() - o.checkedAt.getTime() < 5_000) return o;
  await db.update(subscriptionOrders).set({ checkedAt: new Date() }).where(eq(subscriptionOrders.id, o.id));
  const st = await paygateStatus(reference);
  if (st.state === "paid") return fulfillSubscriptionOrder(reference, { paymentRef: st.paymentRef });
  if (st.state === "failed") return (await failOrder(o.id, st.reason)) ?? o;
  return o;
}

/** Mode test : accepter ou refuser le paiement d'une commande de son entreprise. */
export async function simulateSubscriptionPayment(payer: Payer, reference: string, outcome: "paid" | "failed") {
  assertPayer(payer);
  if (paymentMode() !== "simulation" || !canPayOnline(payer)) throw new BusinessError("Simulation désactivée sur ce serveur");
  const [o] = await db
    .select()
    .from(subscriptionOrders)
    .where(and(eq(subscriptionOrders.reference, reference), eq(subscriptionOrders.companyId, payer.companyId)));
  if (!o || o.provider !== "simulation") throw new NotFoundError("Commande");
  if (o.status !== "pending") return o;
  if (outcome === "paid") return fulfillSubscriptionOrder(reference, { paymentRef: `SIMU-${Date.now().toString(36).toUpperCase()}` });
  return (await failOrder(o.id, "Paiement refusé (simulation)")) ?? o;
}

/** Commande de l'entreprise, à jour (la page de suivi la relit toutes les quelques secondes). */
export async function companySubscriptionOrder(companyId: string, reference: string) {
  if (!SUB_REF.test(reference)) throw new NotFoundError("Commande");
  const [own] = await db
    .select({ id: subscriptionOrders.id })
    .from(subscriptionOrders)
    .where(and(eq(subscriptionOrders.reference, reference), eq(subscriptionOrders.companyId, companyId)));
  if (!own) throw new NotFoundError("Commande");
  const o = await refreshSubscriptionOrder(reference);
  const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, o.planId));
  const [sub] = await db.select({ end: subscriptions.currentPeriodEnd, unlimited: subscriptions.unlimited }).from(subscriptions).where(eq(subscriptions.companyId, companyId));
  return { ...o, planName: plan?.name ?? "", network: o.network as Network, months: o.months as SubMonths, periodEnd: o.status === "paid" ? (sub?.unlimited ? null : sub?.end ?? null) : null };
}

export async function listCompanySubscriptionOrders(companyId: string, limit = 10) {
  return db
    .select({
      reference: subscriptionOrders.reference,
      amount: subscriptionOrders.amount,
      currency: subscriptionOrders.currency,
      months: subscriptionOrders.months,
      status: subscriptionOrders.status,
      createdAt: subscriptionOrders.createdAt,
      planName: plans.name,
    })
    .from(subscriptionOrders)
    .innerJoin(plans, eq(plans.id, subscriptionOrders.planId))
    .where(eq(subscriptionOrders.companyId, companyId))
    .orderBy(desc(subscriptionOrders.createdAt))
    .limit(limit);
}
