import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, customers } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { computeTotals } from "@/lib/money";
import { login, AuthError } from "@/modules/auth/service";
import { createProduct, listProducts, searchForPos, getProduct } from "@/modules/products/service";
import { createSale, cancelSale, posBootstrap } from "@/modules/sales/service";
import { createInvoiceFromSale, getPublicInvoice, getInvoice } from "@/modules/invoices/service";
import { createCustomer, recordCustomerPayment } from "@/modules/customers/service";
import { recordManualMovement } from "@/modules/stock/service";
import { dashboardStats, periodRange } from "@/modules/dashboard/service";
import { newCompany } from "./helpers";

afterAll(async () => {
  // le pool reste ouvert sinon ; vitest s'arrête proprement
});

describe("calculs", () => {
  it("TVA incluse et remise globale", () => {
    const t = computeTotals([{ quantity: 2, unitPrice: 1180, taxRate: 18 }], 0, 0);
    expect(t.total).toBe(2360);
    expect(t.taxTotal).toBe(360);
    expect(t.subtotal).toBe(2000);
    const d = computeTotals([{ quantity: 1, unitPrice: 1000, taxRate: 0 }], 100, 0);
    expect(d.total).toBe(900);
    expect(d.discountTotal).toBe(100);
  });
});

describe("isolation multi-entreprise (RLS)", () => {
  it("une entreprise ne voit jamais les produits d'une autre", async () => {
    const a = await newCompany("Entreprise A");
    const b = await newCompany("Entreprise B");
    const pa = await createProduct(a, { name: "Riz 25kg A", salePrice: 15000, sku: "RIZ25" });
    await createProduct(b, { name: "Riz 25kg B", salePrice: 16000, sku: "RIZ25" }); // même SKU autorisé chez B
    const listB = await listProducts(b, {});
    expect(listB.rows.map((r) => r.name)).toEqual(["Riz 25kg B"]);
    // même une requête sans filtre company_id est bornée par la RLS
    const raw = await withTenant(b, (tx) => tx.select().from(products));
    expect(raw.every((p) => p.companyId === b.companyId)).toBe(true);
    await expect(getProduct(b, pa)).rejects.toThrow(/introuvable/);
    // sans contexte : aucune ligne
    const none = await db.select().from(products);
    expect(none.length).toBe(0);
    // écriture forcée dans une autre entreprise refusée
    await expect(
      withTenant(b, (tx) => tx.insert(customers).values({ companyId: a.companyId, name: "intrus" })),
    ).rejects.toThrow();
    // modification croisée : 0 ligne touchée
    const upd = await withTenant(b, (tx) => tx.update(products).set({ name: "piraté" }).where(eq(products.id, pa)).returning());
    expect(upd.length).toBe(0);
  });
});

describe("vente de caisse", () => {
  it("décrémente le stock, numérote, crée la créance et la facture", async () => {
    const ctx = await newCompany();
    const pid = await createProduct(ctx, { name: "Huile 1L", salePrice: 1500, purchasePrice: 1100, initialStock: 10, barcode: "6001234" });
    const found = await searchForPos(ctx, "6001234");
    expect(found[0].id).toBe(pid);
    expect(found[0].stock).toBe(10);

    const { paymentMethods: pms } = await posBootstrap(ctx);
    const cash = pms.find((p) => p.label === "Espèces")!;
    const s1 = await createSale(ctx, { items: [{ productId: pid, quantity: 3 }], payments: [{ paymentMethodId: cash.id, amount: 5000 }] });
    expect(s1.total).toBe(4500);
    expect(s1.change).toBe(500);
    expect(s1.number).toMatch(/^VTE-\d{4}-000001$/);

    // crédit sans client refusé
    await expect(createSale(ctx, { items: [{ productId: pid, quantity: 1 }], payments: [] })).rejects.toThrow(/client/);

    const cid = await createCustomer(ctx, { name: "Ama" });
    const s2 = await createSale(ctx, { items: [{ productId: pid, quantity: 2 }], customerId: cid, payments: [{ paymentMethodId: cash.id, amount: 1000 }] });
    expect(s2.due).toBe(2000);
    expect(s2.number).toMatch(/000002$/);

    const p = await getProduct(ctx, pid);
    expect(p.stock).toBe(5);

    const invId = await createInvoiceFromSale(ctx, s2.id);
    const inv = await getInvoice(ctx, invId);
    expect(inv.invoice.number).toMatch(/^FACT-\d{4}-000001$/);
    expect(inv.invoice.status).toBe("partially_paid");
    const pub = await getPublicInvoice(inv.invoice.publicToken);
    expect(pub?.invoice.id).toBe(invId);
    expect(pub?.company.id).toBe(ctx.companyId);
    expect(await getPublicInvoice("x".repeat(32))).toBeNull();

    // règlement de la créance
    const paid = await recordCustomerPayment(ctx, { customerId: cid, paymentMethodId: cash.id, amount: 5000 });
    expect(paid).toBe(2000);
    const [c] = await withTenant(ctx, (tx) => tx.select().from(customers).where(eq(customers.id, cid)));
    expect(c.balanceDue).toBe(0);
    expect(c.totalSpent).toBe(3000);

    // annulation : stock restauré
    await cancelSale(ctx, s1.id, "erreur de caisse");
    expect((await getProduct(ctx, pid)).stock).toBe(8);

    // inventaire : quantité comptée
    await recordManualMovement(ctx, { productId: pid, kind: "inventory", quantity: 7, reason: "inventaire" });
    expect((await getProduct(ctx, pid)).stock).toBe(7);

    const stats = await dashboardStats(ctx, periodRange("today"));
    expect(stats.revenueToday).toBe(3000);
    expect(stats.period.count).toBe(1);
  });

  it("numérotation sans doublon sous concurrence", async () => {
    const ctx = await newCompany();
    const pid = await createProduct(ctx, { name: "Savon", salePrice: 500, initialStock: 100 });
    const { paymentMethods: pms } = await posBootstrap(ctx);
    const cash = pms[0];
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createSale(ctx, { items: [{ productId: pid, quantity: 1 }], payments: [{ paymentMethodId: cash.id, amount: 500 }] })),
    );
    expect(new Set(results.map((r) => r.number)).size).toBe(8);
    expect((await getProduct(ctx, pid)).stock).toBe(92);
  });
});

describe("permissions", () => {
  it("un caissier ne voit pas les prix d'achat et ne peut pas annuler", async () => {
    const admin = await newCompany();
    const pid = await createProduct(admin, { name: "Sucre", salePrice: 800, purchasePrice: 600, initialStock: 5 });
    const cashier = { ...admin, roleName: "Caissier", isAdmin: false, permissions: ["sales.create", "sales.view", "products.view", "customers.view"] };
    const list = await listProducts(cashier, {});
    expect(list.rows[0].purchasePrice).toBeNull();
    await expect(createProduct(cashier, { name: "x", salePrice: 1 })).rejects.toThrow(/Permission/);
    const { paymentMethods: pms } = await posBootstrap(cashier);
    const s = await createSale(cashier, { items: [{ productId: pid, quantity: 1 }], payments: [{ paymentMethodId: pms[0].id, amount: 800 }] });
    await expect(cancelSale(cashier, s.id, "test")).rejects.toThrow(/Permission/);
  });
});

describe("authentification", () => {
  it("bloque après 5 échecs", async () => {
    const ctx = await newCompany();
    const email = ctx.user.email;
    const meta = { ip: `10.0.0.${Math.floor(Math.random() * 250)}` };
    const ok = await login({ email, password: "motdepasse123" }, meta);
    expect(ok.companyId).toBe(ctx.companyId);
    for (let i = 0; i < 5; i++) await expect(login({ email, password: "faux" }, meta)).rejects.toThrow(AuthError);
    await expect(login({ email, password: "motdepasse123" }, meta)).rejects.toThrow(/Trop de tentatives/);
  });
});

void sql;

describe("taxes", () => {
  it("applique la TVA par défaut quand aucune taxe n'est précisée", async () => {
    const ctx = await newCompany();
    const pid = await createProduct(ctx, { name: "Lait", salePrice: 1180 });
    const [p] = await searchForPos(ctx, "Lait");
    expect(p.id).toBe(pid);
    expect(p.taxRate).toBe(18);
  });
});
