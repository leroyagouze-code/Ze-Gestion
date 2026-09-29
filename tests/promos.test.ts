import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { licenseOrders, plans, platformPromoCodes, promoCodes, sales, subscriptionPayments } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { localDate } from "@/lib/dates";
import { promoDiscount, promoProblem } from "@/lib/promo";
import { recordSubscriptionPayment } from "@/modules/admin/service";
import type { AppContext } from "@/modules/auth/context";
import { createProduct } from "@/modules/products/service";
import { deletePromo, listPromos, lookupPromo, savePromo, setPromoActive } from "@/modules/promos/service";
import { cancelSale, createSale, posBootstrap } from "@/modules/sales/service";
import { newCompany } from "./helpers";

const { createOrder, previewPromo, publicOrder, simulatePayment } = await import("@/modules/billing/license-orders");
const { deletePlatformPromo, savePlatformPromo } = await import("@/modules/billing/platform-promos");

const jwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
beforeAll(() => {
  vi.stubEnv("LICENSE_PRIVATE_KEY", jwk.d!);
  vi.stubEnv("PAYMENT_MODE", "simulation");
});
afterAll(() => vi.unstubAllEnvs());

const day = (offset: number) => localDate(new Date(Date.now() + offset * 86_400_000), "Africa/Lome");
const uniq = (prefix: string) => `${prefix}${randomBytes(3).toString("hex").toUpperCase()}`;

/** Boutique avec un produit à 10 000 (stock 100) et le moyen de paiement « Espèces ». */
async function shop(name: string) {
  const ctx = await newCompany(name);
  const pid = await createProduct(ctx, { name: "Pagne wax", salePrice: 10000, purchasePrice: 6000, initialStock: 100 });
  const { paymentMethods } = await posBootstrap(ctx);
  const cash = paymentMethods.find((p) => p.label === "Espèces")!;
  const sell = (qty: number, promoCode?: string, c: AppContext = ctx) =>
    createSale(c, { items: [{ productId: pid, quantity: qty }], promoCode, payments: [{ paymentMethodId: cash.id, amount: qty * 10000 }] });
  return { ctx, pid, sell };
}

const code = (extra: Record<string, unknown> = {}) => ({ code: uniq("P"), kind: "percent", value: "10", isActive: "on", ...extra });

describe("règles des codes promo", () => {
  it("pourcentage ou montant fixe, jamais plus que le montant", () => {
    expect(promoDiscount({ kind: "percent", value: 10 }, 25000)).toBe(2500);
    expect(promoDiscount({ kind: "percent", value: 15 }, 999, 0)).toBe(150);
    expect(promoDiscount({ kind: "amount", value: 2000 }, 25000)).toBe(2000);
    expect(promoDiscount({ kind: "amount", value: 2000 }, 1500)).toBe(1500);
    expect(promoDiscount({ kind: "percent", value: 150 }, 1000)).toBe(1000);
  });

  it("dates, activation et plafond", () => {
    const base = { code: "X", kind: "percent", value: 10, startsOn: null, endsOn: null, maxUses: null, usedCount: 0, isActive: true };
    expect(promoProblem(base, "2026-09-29")).toBeNull();
    expect(promoProblem({ ...base, endsOn: "2026-09-28" }, "2026-09-29")).toMatch(/expiré/);
    expect(promoProblem({ ...base, endsOn: "2026-09-29" }, "2026-09-29")).toBeNull(); // date de fin incluse
    expect(promoProblem({ ...base, startsOn: "2026-10-01" }, "2026-09-29")).toMatch(/pas encore/);
    expect(promoProblem({ ...base, maxUses: 3, usedCount: 3 }, "2026-09-29")).toMatch(/maximal/);
    expect(promoProblem({ ...base, isActive: false }, "2026-09-29")).toMatch(/plus actif/);
    expect(promoProblem({ ...base, minPurchase: 5000 }, "2026-09-29", 4000)).toMatch(/au moins 5 000/);
  });
});

describe("codes promo en caisse", () => {
  it("pourcentage : remise globale calculée par le serveur, code enregistré sur la vente, casse ignorée", async () => {
    const { ctx, sell } = await shop("Promo Pourcentage");
    const c = await savePromo(ctx, null, code({ code: "rentree10", value: "10" }));
    expect(c.code).toBe("RENTREE10");
    expect((await lookupPromo(ctx, " Rentree10 ")).value).toBe(10);

    const s = await sell(2, "Rentree10");
    expect(s).toMatchObject({ total: 18000, promoCode: "RENTREE10", promoDiscount: 2000 });
    const [row] = await withTenant(ctx, (tx) => tx.select().from(sales).where(eq(sales.id, s.id)));
    expect(row).toMatchObject({ promoCodeId: c.id, promoCode: "RENTREE10", promoDiscount: 2000, discountTotal: 2000, total: 18000 });
    expect((await listPromos(ctx))[0].usedCount).toBe(1);
  });

  it("montant fixe avec achat minimum ; utilisable par un caissier sans droit de remise", async () => {
    const { ctx, pid, sell } = await shop("Promo Fixe");
    await savePromo(ctx, null, code({ code: "MOINS2000", kind: "amount", value: "2000", minPurchase: "15000" }));
    await expect(sell(1, "MOINS2000")).rejects.toThrow(/au moins 15 000/);
    const cashier = { ...ctx, permissions: ctx.permissions.filter((p) => p !== "sales.discount") };
    const s = await sell(2, "moins2000", cashier);
    expect(s).toMatchObject({ total: 18000, promoDiscount: 2000 });
    // une remise manuelle reste refusée sans le droit
    await expect(createSale(cashier, { items: [{ productId: pid, quantity: 1 }], discount: 100 })).rejects.toThrow(/remises/);
  });

  it("refuse un code expiré, pas encore valable, désactivé ou inconnu, sans rien enregistrer", async () => {
    const { ctx, sell } = await shop("Promo Dates");
    await savePromo(ctx, null, code({ code: "HIER", endsOn: day(-2) }));
    await savePromo(ctx, null, code({ code: "DEMAIN", startsOn: day(2) }));
    const off = await savePromo(ctx, null, code({ code: "ETEINT" }));
    await setPromoActive(ctx, off.id, false);
    await expect(sell(1, "HIER")).rejects.toThrow(/expiré/);
    await expect(sell(1, "DEMAIN")).rejects.toThrow(/pas encore/);
    await expect(sell(1, "ETEINT")).rejects.toThrow(/plus actif/);
    await expect(sell(1, "NIMPORTEQUOI")).rejects.toThrow(/inconnu/);
    await expect(lookupPromo(ctx, "HIER")).rejects.toThrow(/expiré/);
    expect(await withTenant(ctx, (tx) => tx.select().from(sales))).toHaveLength(0);
  });

  it("nombre maximal d'utilisations respecté, même avec des ventes simultanées ; une annulation rend l'utilisation", async () => {
    const { ctx, sell } = await shop("Promo Plafond");
    const c = await savePromo(ctx, null, code({ code: "TROIS", maxUses: "3" }));
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => sell(1, "TROIS")));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(3);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/maximal/);
    expect((await listPromos(ctx)).find((p) => p.id === c.id)!.usedCount).toBe(3);

    await cancelSale(ctx, (ok[0] as PromiseFulfilledResult<{ id: string }>).value.id, "erreur de caisse");
    expect((await listPromos(ctx)).find((p) => p.id === c.id)!.usedCount).toBe(2);
    await expect(sell(1, "TROIS")).resolves.toMatchObject({ promoCode: "TROIS" });
    await expect(sell(1, "TROIS")).rejects.toThrow(/maximal/);

    // un code déjà utilisé ne se supprime pas, et son plafond ne descend pas sous les utilisations
    await expect(deletePromo(ctx, c.id)).rejects.toThrow(/désactivez/);
    await expect(savePromo(ctx, c.id, code({ code: "TROIS", maxUses: "1" }))).rejects.toThrow(/inférieur/);
  });

  it("isolation : chaque entreprise ne voit et n'utilise que ses propres codes", async () => {
    const a = await shop("Promo A");
    const b = await shop("Promo B");
    const ca = await savePromo(a.ctx, null, code({ code: "BIENVENUE", value: "50" }));
    await expect(b.sell(1, "BIENVENUE")).rejects.toThrow(/inconnu/);
    await expect(lookupPromo(b.ctx, "BIENVENUE")).rejects.toThrow(/inconnu/);
    expect(await listPromos(b.ctx)).toHaveLength(0);
    // RLS : même une requête sans filtre ne voit pas les codes de l'autre entreprise
    expect(await withTenant(b.ctx, (tx) => tx.select().from(promoCodes))).toHaveLength(0);
    await expect(setPromoActive(b.ctx, ca.id, false)).rejects.toThrow(/introuvable/);
    await expect(
      withTenant(b.ctx, (tx) => tx.insert(promoCodes).values({ companyId: a.ctx.companyId, code: "PIRATE", kind: "percent", value: 90 })),
    ).rejects.toThrow();
    // le même code peut exister chez B, indépendant
    await savePromo(b.ctx, null, code({ code: "bienvenue", value: "5" }));
    await expect(savePromo(b.ctx, null, code({ code: "BIENVENUE" }))).rejects.toThrow(/existe déjà/);
    expect(await b.sell(1, "BIENVENUE")).toMatchObject({ total: 9500 });
    expect(await a.sell(1, "BIENVENUE")).toMatchObject({ total: 5000 });
    expect((await listPromos(a.ctx))[0].usedCount).toBe(1);
  });

  it("gestion réservée à la permission promos.manage", async () => {
    const { ctx } = await shop("Promo Droits");
    const noRight = { ...ctx, permissions: ctx.permissions.filter((p) => p !== "promos.manage") };
    await expect(savePromo(noRight, null, code())).rejects.toThrow(/Permission/);
    await expect(listPromos(noRight)).rejects.toThrow(/Permission/);
    await expect(savePromo(ctx, null, code({ value: "120" }))).rejects.toThrow(/100/);
    await expect(savePromo(ctx, null, code({ startsOn: day(3), endsOn: day(1) }))).rejects.toThrow(/fin/);
  });
});

describe("codes promo de la plateforme", () => {
  // Super admin de test : un vrai utilisateur (created_by référence la table users)
  const admin = { userId: "", isSuperAdmin: true };
  beforeAll(async () => {
    admin.userId = (await newCompany("Plateforme")).userId;
  });
  const pc = () => {
    const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const s = Array.from(randomBytes(8), (b) => A[b & 31]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  };
  const order = (promoCode?: string, offer = "PRO:12") => ({ installId: pc(), offer, customerName: "Boutique Test", phone: "90123456", network: "TMONEY", promoCode });
  const usedCount = async (id: string) => (await db.select().from(platformPromoCodes).where(eq(platformPromoCodes.id, id)))[0].usedCount;

  it("achat de licence : prix réduit calculé par le serveur et code enregistré sur la commande", async () => {
    const p = await savePlatformPromo(admin, null, { ...code({ value: "20" }), scope: "license", plans: ["PRO"] });
    expect(await previewPromo(p.code.toLowerCase(), "PRO:12")).toMatchObject({ listAmount: 150000, discount: 30000, amount: 120000 });

    const ref = await createOrder(order(p.code.toLowerCase()));
    expect(await publicOrder(ref)).toMatchObject({ amount: 120000, listAmount: 150000, discountAmount: 30000, promoCode: p.code });
    const [o] = await db.select().from(licenseOrders).where(eq(licenseOrders.reference, ref));
    expect(o.promoCodeId).toBe(p.id);
    expect(await usedCount(p.id)).toBe(1);
    await simulatePayment(ref, "paid");
    expect(await usedCount(p.id)).toBe(1);

    // formule non concernée
    await expect(createOrder(order(p.code, "BASIC:12"))).rejects.toThrow(/réservé à la formule PRO/);
    await expect(deletePlatformPromo(admin, p.id)).rejects.toThrow(/désactivez/);
  });

  it("paiement échoué : l'utilisation est rendue ; plafond respecté sous concurrence", async () => {
    const p = await savePlatformPromo(admin, null, { ...code({ kind: "amount", value: "5000", maxUses: "2" }) });
    const ref = await createOrder(order(p.code));
    expect(await usedCount(p.id)).toBe(1);
    await simulatePayment(ref, "failed");
    await simulatePayment(ref, "failed"); // deuxième échec : rien de plus
    expect(await usedCount(p.id)).toBe(0);

    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createOrder(order(p.code))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await usedCount(p.id)).toBe(2);
    await expect(createOrder(order(p.code))).rejects.toThrow(/maximal/);
  });

  it("refuse un code expiré, d'abonnement seulement, ou désactivé ; jamais sous le minimum payable", async () => {
    const expired = await savePlatformPromo(admin, null, { ...code({ endsOn: day(-1) }) });
    await expect(createOrder(order(expired.code))).rejects.toThrow(/expiré/);
    const subsOnly = await savePlatformPromo(admin, null, { ...code(), scope: "subscription" });
    await expect(createOrder(order(subsOnly.code))).rejects.toThrow(/licences/);
    await expect(createOrder(order("INCONNU-" + uniq("")))).rejects.toThrow(/inconnu/);
    const off = await savePlatformPromo(admin, null, { ...code({ isActive: "" }) });
    await expect(previewPromo(off.code, "PRO:12")).rejects.toThrow(/plus actif/);
    const free = await savePlatformPromo(admin, null, { ...code({ value: "100" }) });
    expect(await publicOrder(await createOrder(order(free.code)))).toMatchObject({ amount: 100, discountAmount: 149900 });
    // codes uniques sans tenir compte de la casse
    await expect(savePlatformPromo(admin, null, { ...code({ code: free.code.toLowerCase() }) })).rejects.toThrow(/existe déjà/);
    await expect(savePlatformPromo({ ...admin, isSuperAdmin: false }, null, code())).rejects.toThrow(/réservé/);
  });

  it("paiement d'abonnement : montant = tarif × mois − réduction", async () => {
    const ctx = await newCompany("Abonnement Promo");
    const [pro] = await db.select().from(plans).where(eq(plans.code, "PRO"));
    const p = await savePlatformPromo(admin, null, { ...code({ value: "25" }), scope: "subscription" });
    const a = { userId: ctx.userId, isSuperAdmin: true };
    await recordSubscriptionPayment(a, ctx.companyId, { planId: pro.id, months: 4, amount: "1", method: "cash", promoCode: p.code.toLowerCase() });
    const [pay] = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.companyId, ctx.companyId));
    expect(pay).toMatchObject({ amount: 45000, discountAmount: 15000, promoCode: p.code, promoCodeId: p.id });
    expect(await usedCount(p.id)).toBe(1);
    const licOnly = await savePlatformPromo(admin, null, { ...code(), scope: "license" });
    await expect(recordSubscriptionPayment(a, ctx.companyId, { planId: pro.id, months: 1, method: "cash", promoCode: licOnly.code })).rejects.toThrow(/abonnements/);
    await expect(recordSubscriptionPayment(a, ctx.companyId, { planId: pro.id, months: 1, method: "cash" })).rejects.toThrow(/Montant/);
    // la contrainte CHECK empêche tout dépassement, même par une requête directe
    await db.update(platformPromoCodes).set({ maxUses: 1 }).where(eq(platformPromoCodes.id, p.id));
    await expect(db.update(platformPromoCodes).set({ usedCount: sql`${platformPromoCodes.usedCount} + 1` }).where(eq(platformPromoCodes.id, p.id))).rejects.toThrow();
  });
});
