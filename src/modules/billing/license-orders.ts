import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { licenseIssues, licenseOrders, licensePrices } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { createLicense, LICENSE_PLANS, normalizeCode, type LicensePlan } from "@/lib/license";
import { LICENSE_DURATIONS, licenseEnd } from "@/modules/billing/license";
import { PUBLIC_INVALID, quotePublicPromo, releasePlatformPromo, reservePlatformPromo } from "@/modules/billing/platform-promos";
import { localPhone, NETWORKS, paygateStatus, paymentMode, requestPaygatePayment, type Network } from "@/modules/billing/paygate";

/**
 * Vente des licences en ligne : le client choisit sa formule, paie, et la clé est fabriquée
 * automatiquement pour son code d'installation dès que le paiement est confirmé.
 */

type Admin = { userId: string; isSuperAdmin: boolean };
type Duration = keyof typeof LICENSE_DURATIONS;
const PLAN_VALUES = Object.values(LICENSE_PLANS) as [LicensePlan, ...LicensePlan[]];
const DURATION_KEYS = Object.keys(LICENSE_DURATIONS) as [Duration, ...Duration[]];

export const ORDER_STATUS = {
  pending: { label: "En attente", tone: "amber" },
  paid: { label: "Payée", tone: "green" },
  failed: { label: "Échouée", tone: "red" },
  cancelled: { label: "Annulée", tone: "slate" },
} as const;

const formatInstall = (id: string) => `${id.slice(0, 4)}-${id.slice(4)}`;

/* ─────────── Tarifs ─────────── */

export async function listPrices(opts: { activeOnly?: boolean } = {}) {
  const rows = await db
    .select()
    .from(licensePrices)
    .where(opts.activeOnly ? eq(licensePrices.isActive, true) : undefined)
    .orderBy(asc(licensePrices.plan), asc(licensePrices.amount));
  const planOrder = (p: string) => PLAN_VALUES.indexOf(p as LicensePlan);
  return rows.sort((a, b) => planOrder(a.plan) - planOrder(b.plan) || a.amount - b.amount);
}

export const priceSchema = z.object({
  plan: z.enum(PLAN_VALUES),
  duration: z.enum(DURATION_KEYS),
  amount: z.coerce.number().int("Montant entier").min(100, "100 minimum").max(100_000_000),
  isActive: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
});

export async function savePrice(admin: Admin, raw: unknown) {
  if (!admin.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
  const p = priceSchema.parse(raw);
  await db
    .insert(licensePrices)
    .values(p)
    .onConflictDoUpdate({ target: [licensePrices.plan, licensePrices.duration], set: { amount: p.amount, isActive: p.isActive, updatedAt: new Date() } });
}

/* ─────────── Commande ─────────── */

export const orderSchema = z.object({
  installId: z
    .string()
    .trim()
    .transform(normalizeCode)
    .pipe(z.string().regex(/^[0-9A-Z]{8}$/, "Code d'installation invalide : 8 caractères, affichés dans le menu Licence du logiciel")),
  offer: z.string().regex(/^[A-Z]+:[a-z0-9]+$/, "Choisissez une formule"),
  customerName: z.string().trim().min(2, "Nom requis").max(120),
  phone: z
    .string()
    .trim()
    .transform(localPhone)
    .pipe(z.string().regex(/^\d{8}$/, "Numéro à 8 chiffres, par exemple 90 12 34 56")),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().email("E-mail invalide").nullable()),
  network: z.enum(Object.keys(NETWORKS) as [Network, ...Network[]], { message: "Choisissez TMoney ou Flooz" }),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
});

async function activePrice(offer: string) {
  const [plan, duration] = offer.split(":");
  const [price] = await db
    .select()
    .from(licensePrices)
    .where(and(eq(licensePrices.plan, plan), eq(licensePrices.duration, duration), eq(licensePrices.isActive, true)));
  if (!price) throw new BusinessError("Cette formule n'est plus proposée");
  return price;
}

/** Aperçu du prix avec un code promo sur la page d'achat (le prix payé est recalculé à la commande). */
export async function previewPromo(rawCode: string, offer: string, meta: { ip?: string | null } = {}) {
  if (!/^[A-Z]+:[a-z0-9]+$/.test(offer)) throw new BusinessError("Choisissez une formule");
  const price = await activePrice(offer);
  const q = await quotePublicPromo(rawCode, { target: "license", plan: price.plan, amount: price.amount }, meta.ip);
  return { code: q.promo.code, listAmount: price.amount, discount: q.discount, amount: q.amount, currency: price.currency };
}

/**
 * Commande échouée : le code promo éventuel récupère son utilisation.
 * Seule une commande encore en attente passe en échec (une seule fois, même en cas d'appels simultanés).
 */
async function failOrder(id: string, reason: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx
      .update(licenseOrders)
      .set({ status: "failed", failureReason: reason })
      .where(and(eq(licenseOrders.id, id), eq(licenseOrders.status, "pending")))
      .returning();
    if (f?.promoCodeId) await releasePlatformPromo(tx, f.promoCodeId);
    return f;
  });
}

function newReference() {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return "ZL" + Array.from(randomBytes(8), (b) => A[b & 31]).join("");
}

export async function createOrder(raw: unknown, meta: { ip?: string | null } = {}) {
  const mode = paymentMode();
  if (!mode) throw new BusinessError("La vente en ligne n'est pas encore ouverte. Contactez ZE GROUP.");
  if (!process.env.LICENSE_PRIVATE_KEY) throw new BusinessError("La vente en ligne n'est pas configurée sur ce serveur (clé des licences absente).");
  const input = orderSchema.parse(raw);
  const price = await activePrice(input.offer);
  // Prix payé calculé ici, depuis le tarif en base : le navigateur n'envoie que le code
  const quote = input.promoCode ? await quotePublicPromo(input.promoCode, { target: "license", plan: price.plan, amount: price.amount }, meta.ip) : null;
  const amount = quote ? quote.amount : price.amount;
  const installId = formatInstall(input.installId);
  // Limite simple contre les abus : 5 commandes par poste et par heure
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(licenseOrders)
    .where(and(eq(licenseOrders.installId, installId), gt(licenseOrders.createdAt, sql`now() - interval '1 hour'`)));
  if (recent.n >= 5) throw new BusinessError("Trop de tentatives pour cet ordinateur. Réessayez dans une heure.");

  const reference = newReference();
  const order = await db.transaction(async (tx) => {
    // L'utilisation du code est réservée à la commande (rendue si le paiement échoue)
    if (quote) await reservePlatformPromo(tx, quote.promo.id).catch(() => Promise.reject(new BusinessError(PUBLIC_INVALID)));
    const [o] = await tx
      .insert(licenseOrders)
      .values({
        reference,
        installId,
        plan: price.plan,
        duration: price.duration,
        amount,
        listAmount: price.amount,
        discountAmount: quote?.discount ?? 0,
        promoCodeId: quote?.promo.id ?? null,
        promoCode: quote?.promo.code ?? null,
        currency: price.currency,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email,
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
      description: `Licence ZE Gestion ${price.plan} ${LICENSE_DURATIONS[price.duration as Duration]}`,
    });
    if (res.ok) await db.update(licenseOrders).set({ providerRef: res.txReference }).where(eq(licenseOrders.id, order.id));
    else await failOrder(order.id, res.reason);
  }
  return reference;
}

/** Livre la licence d'une commande payée (une seule fois, même si le paiement est confirmé plusieurs fois). */
export async function fulfillOrder(reference: string, payment: { paymentRef?: string | null } = {}) {
  const key = process.env.LICENSE_PRIVATE_KEY;
  if (!key) throw new BusinessError("Clé des licences absente sur ce serveur");
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(licenseOrders).where(eq(licenseOrders.reference, reference)).for("update");
    if (!o) throw new NotFoundError("Commande");
    if (o.status === "paid") return o;
    const expiresAt = licenseEnd(o.duration as Duration);
    const code = createLicense(key, o.installId, o.plan as LicensePlan, expiresAt);
    const [issue] = await tx
      .insert(licenseIssues)
      .values({ installId: o.installId, plan: o.plan, expiresAt, customer: `${o.customerName} · achat en ligne ${o.reference}`, code })
      .returning({ id: licenseIssues.id });
    const [paid] = await tx
      .update(licenseOrders)
      .set({ status: "paid", paidAt: new Date(), code, licenseIssueId: issue.id, paymentRef: payment.paymentRef ?? o.paymentRef, failureReason: null })
      .where(eq(licenseOrders.id, o.id))
      .returning();
    return paid;
  });
}

/** Met à jour une commande en attente en demandant son statut à PayGate (au plus toutes les 5 secondes). */
export async function refreshOrder(reference: string, opts: { force?: boolean } = {}) {
  const [o] = await db.select().from(licenseOrders).where(eq(licenseOrders.reference, reference));
  if (!o) throw new NotFoundError("Commande");
  if (o.status !== "pending" || o.provider !== "paygate" || paymentMode() !== "paygate") return o;
  if (!opts.force && o.checkedAt && Date.now() - o.checkedAt.getTime() < 5_000) return o;
  await db.update(licenseOrders).set({ checkedAt: new Date() }).where(eq(licenseOrders.id, o.id));
  const st = await paygateStatus(reference);
  if (st.state === "paid") return fulfillOrder(reference, { paymentRef: st.paymentRef });
  if (st.state === "failed") return (await failOrder(o.id, st.reason)) ?? o;
  return o;
}

/** Page de test : accepter ou refuser le paiement (mode simulation uniquement). */
export async function simulatePayment(reference: string, outcome: "paid" | "failed") {
  if (paymentMode() !== "simulation") throw new BusinessError("Simulation désactivée sur ce serveur");
  const [o] = await db.select().from(licenseOrders).where(eq(licenseOrders.reference, reference));
  if (!o || o.provider !== "simulation") throw new NotFoundError("Commande");
  if (o.status !== "pending") return o;
  if (outcome === "paid") return fulfillOrder(reference, { paymentRef: `SIMU-${Date.now().toString(36).toUpperCase()}` });
  return (await failOrder(o.id, "Paiement refusé (simulation)")) ?? o;
}

/** Vue publique d'une commande : ce que le client voit sur la page de suivi. */
export async function publicOrder(reference: string) {
  const o = await refreshOrder(reference);
  return {
    reference: o.reference,
    installId: o.installId,
    plan: o.plan,
    duration: o.duration as Duration,
    amount: o.amount,
    listAmount: o.listAmount,
    discountAmount: o.discountAmount,
    promoCode: o.promoCode,
    currency: o.currency,
    network: o.network as Network | null,
    phone: o.phone,
    provider: o.provider,
    status: o.status as keyof typeof ORDER_STATUS,
    failureReason: o.failureReason,
    code: o.status === "paid" ? o.code : null,
    expiresAt: o.status === "paid" ? licenseEnd(o.duration as Duration, o.paidAt ?? new Date()) : null,
  };
}

/**
 * Dernière licence valable pour un poste (achat en ligne ou code créé à la main).
 * Sert au logiciel pour s'activer tout seul : un code ne fonctionne que sur son poste, le donner n'expose rien.
 */
export async function latestLicenseFor(rawInstallId: string) {
  const id = normalizeCode(rawInstallId);
  if (!/^[0-9A-Z]{8}$/.test(id)) return null;
  // Les commandes en attente de ce poste sont revérifiées au passage (si PayGate n'a pas prévenu)
  const pending = await db
    .select({ reference: licenseOrders.reference })
    .from(licenseOrders)
    .where(and(eq(licenseOrders.installId, formatInstall(id)), eq(licenseOrders.status, "pending"), gt(licenseOrders.createdAt, sql`now() - interval '2 days'`)))
    .limit(3);
  for (const p of pending) await refreshOrder(p.reference).catch(() => undefined);
  const [row] = await db
    .select({ code: licenseIssues.code, plan: licenseIssues.plan, expiresAt: licenseIssues.expiresAt })
    .from(licenseIssues)
    .where(and(eq(licenseIssues.installId, formatInstall(id)), or(isNull(licenseIssues.expiresAt), gt(licenseIssues.expiresAt, new Date()))))
    .orderBy(desc(licenseIssues.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listOrders(admin: Admin, opts: { status?: string; limit?: number } = {}) {
  if (!admin.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
  const status = opts.status && opts.status in ORDER_STATUS ? opts.status : undefined;
  return db
    .select()
    .from(licenseOrders)
    .where(status ? eq(licenseOrders.status, status) : undefined)
    .orderBy(desc(licenseOrders.createdAt))
    .limit(opts.limit ?? 100);
}
