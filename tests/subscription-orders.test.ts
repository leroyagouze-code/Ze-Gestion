import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { withTenant } from "@/db/tenant";
import { auditLogs, subscriptionOrders, subscriptionPayments, subscriptions } from "@/db/schema";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { savePlatformPromo } from "@/modules/billing/platform-promos";
import {
  canPayOnline,
  companySubscriptionOrder,
  createSubscriptionOrder,
  fulfillSubscriptionOrder,
  listSubscriptionOffers,
  previewSubscriptionPromo,
  refreshSubscriptionOrder,
  simulateSubscriptionPayment,
} from "@/modules/billing/subscription-orders";
import { newCompany } from "./helpers";

const payer = (ctx: AppContext) => ({ companyId: ctx.companyId, userId: ctx.userId, isAdmin: ctx.isAdmin });
const order = (extra: Record<string, unknown> = {}) => ({ plan: "PRO", months: "12", phone: "+228 90 12 34 56", network: "TMONEY", ...extra });
const sub = async (companyId: string) => (await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)))[0];
const reload = async (ctx: AppContext) =>
  (await loadContext({ userId: ctx.userId, fullName: ctx.user.fullName, email: ctx.user.email, isSuperAdmin: false }, ctx.companyId))!;
const DAY = 86_400_000;

beforeAll(() => vi.stubEnv("PAYMENT_MODE", "simulation"));
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe("abonnement payé en ligne", () => {
  it("propose les formules payantes, 12 mois au prix de 10", async () => {
    const offers = await listSubscriptionOffers();
    expect(offers.map((o) => o.code)).toEqual(["BASIC", "PRO", "BUSINESS"]);
    const pro = offers.find((o) => o.code === "PRO")!;
    expect(pro.durations.map((d) => [d.months, d.amount])).toEqual([[1, 15000], [3, 45000], [6, 90000], [12, 150000]]);
    expect(pro.features).toContain("10 utilisateurs");
  });

  it("mode test : le paiement réussi active la formule, une seule fois", async () => {
    const ctx = await newCompany("Abonné en ligne");
    const ref = await createSubscriptionOrder(payer(ctx), order());
    expect(ref).toMatch(/^ZA[0-9A-Z]{8}$/);
    expect(await companySubscriptionOrder(ctx.companyId, ref)).toMatchObject({ status: "pending", amount: 150000, phone: "90123456", planName: "Pro" });
    expect((await sub(ctx.companyId)).status).toBe("trialing");

    await simulateSubscriptionPayment(payer(ctx), ref, "paid");
    const o = await companySubscriptionOrder(ctx.companyId, ref);
    expect(o.status).toBe("paid");
    const s = await sub(ctx.companyId);
    expect(s.status).toBe("active");
    expect(s.currentPeriodEnd!.getTime() - Date.now()).toBeGreaterThan(360 * DAY);
    expect((await reload(ctx)).subscription).toMatchObject({ planName: "Pro", readOnly: false });

    // Une seconde confirmation ne double ni le paiement ni la période
    await fulfillSubscriptionOrder(ref);
    const pays = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.companyId, ctx.companyId));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ amount: 150000, months: 12, method: "other", recordedBy: null });
    expect((await sub(ctx.companyId)).currentPeriodEnd).toEqual(s.currentPeriodEnd);
    // Journal lisible seulement depuis l'entreprise (RLS)
    const logs = await withTenant(ctx, (tx) => tx.select().from(auditLogs).where(and(eq(auditLogs.companyId, ctx.companyId), eq(auditLogs.action, "billing.subscription_paid"))));
    expect(logs).toHaveLength(1);
  });

  it("prolonge la période en cours au lieu de la remplacer", async () => {
    const ctx = await newCompany("Renouvellement");
    const r1 = await createSubscriptionOrder(payer(ctx), order({ months: "1" }));
    await simulateSubscriptionPayment(payer(ctx), r1, "paid");
    const end1 = (await sub(ctx.companyId)).currentPeriodEnd!;
    const r2 = await createSubscriptionOrder(payer(ctx), order({ plan: "BASIC", months: "3" }));
    await simulateSubscriptionPayment(payer(ctx), r2, "paid");
    const s = await sub(ctx.companyId);
    expect(s.currentPeriodEnd!.getTime() - end1.getTime()).toBeGreaterThan(88 * DAY);
    expect((await reload(ctx)).subscription.planName).toBe("Basic");
  });

  it("un compte en lecture seule peut payer et repart aussitôt", async () => {
    const ctx = await newCompany("Essai fini");
    await db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - DAY) }).where(eq(subscriptions.companyId, ctx.companyId));
    const ro = await reload(ctx);
    expect(ro.subscription.readOnly).toBe(true);
    const ref = await createSubscriptionOrder(payer(ro), order({ months: "1" }));
    await simulateSubscriptionPayment(payer(ro), ref, "paid");
    expect((await reload(ctx)).subscription.readOnly).toBe(false);
  });

  it("paiement refusé : rien n'est activé et le code promo est rendu", async () => {
    const ctx = await newCompany("Promo abonnement");
    const admin = { userId: ctx.userId, isSuperAdmin: true };
    const p = await savePlatformPromo(admin, null, { code: `AB${randomUUID().slice(0, 6)}`, kind: "percent", value: "20", isActive: "on", scope: "subscription", maxUses: "1" });
    expect(await previewSubscriptionPromo(p.code, "PRO", 12)).toMatchObject({ listAmount: 150000, discount: 30000, amount: 120000 });
    const ref = await createSubscriptionOrder(payer(ctx), order({ promoCode: p.code.toLowerCase() }));
    expect(await companySubscriptionOrder(ctx.companyId, ref)).toMatchObject({ amount: 120000, discountAmount: 30000, promoCode: p.code });
    // Le seul usage est réservé par la commande en attente
    await expect(createSubscriptionOrder(payer(ctx), order({ promoCode: p.code }))).rejects.toThrow(/invalide/);
    await simulateSubscriptionPayment(payer(ctx), ref, "failed");
    expect((await sub(ctx.companyId)).status).toBe("trialing");
    // Rendu après l'échec : il resert
    const again = await createSubscriptionOrder(payer(ctx), order({ promoCode: p.code }));
    expect(again).toMatch(/^ZA/);
  });

  it("réservé à l'administrateur, et chaque entreprise ne voit que ses commandes", async () => {
    const ctx = await newCompany("Commandes privées");
    const other = await newCompany("Voisin");
    await expect(createSubscriptionOrder({ ...payer(ctx), isAdmin: false }, order())).rejects.toThrow(/administrateur/);
    const ref = await createSubscriptionOrder(payer(ctx), order());
    await expect(companySubscriptionOrder(other.companyId, ref)).rejects.toThrow();
    await expect(simulateSubscriptionPayment(payer(other), ref, "paid")).rejects.toThrow();
    expect((await sub(ctx.companyId)).status).toBe("trialing");
  });

  it("en production, le mode test est réservé au super admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(canPayOnline({ isSuperAdmin: false })).toBe(false);
      expect(canPayOnline({ isSuperAdmin: true })).toBe(true);
      const ctx = await newCompany("Prod test");
      await expect(createSubscriptionOrder(payer(ctx), order())).rejects.toThrow(/pas encore ouvert/);
    } finally {
      vi.stubEnv("NODE_ENV", "test");
    }
  });

  it("PayGate : demande au téléphone, puis activation quand PayGate confirme", async () => {
    vi.stubEnv("PAYMENT_MODE", "");
    vi.stubEnv("PAYGATE_API_KEY", "cle-test");
    let paid = false;
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url.endsWith("/api/v1/pay")) return Response.json({ tx_reference: "TX9", status: 0 });
      return Response.json(paid ? { status: 0, payment_reference: "FL77", payment_method: "Flooz" } : { status: 2 });
    });
    try {
      const ctx = await newCompany("Client PayGate");
      const ref = await createSubscriptionOrder(payer(ctx), order({ network: "FLOOZ", months: "1" }));
      expect(calls[0].body).toMatchObject({ phone_number: "90123456", amount: 15000, identifier: ref, network: "FLOOZ" });
      expect(await refreshSubscriptionOrder(ref, { force: true })).toMatchObject({ status: "pending", providerRef: "TX9" });
      paid = true;
      expect(await refreshSubscriptionOrder(ref, { force: true })).toMatchObject({ status: "paid", paymentRef: "FL77" });
      expect((await sub(ctx.companyId)).status).toBe("active");
      const [pay] = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.companyId, ctx.companyId));
      expect(pay.method).toBe("flooz");
      await expect(simulateSubscriptionPayment(payer(ctx), ref, "paid")).rejects.toThrow(/Simulation/);
      const [o] = await db.select().from(subscriptionOrders).where(eq(subscriptionOrders.reference, ref));
      expect(o.paymentId).toBe(pay.id);
    } finally {
      vi.stubEnv("PAYGATE_API_KEY", "");
      vi.stubEnv("PAYMENT_MODE", "simulation");
    }
  });
});
