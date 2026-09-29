import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { allocate, computeTotals, storedVatBreakdown, vatDetail } from "@/lib/money";
import { createInvoiceFromSale, createManualInvoice, getInvoice } from "@/modules/invoices/service";
import { createProduct } from "@/modules/products/service";
import { salesReport } from "@/modules/reports/service";
import { createSale, getSale, posBootstrap } from "@/modules/sales/service";
import { setTaxMode } from "@/modules/settings/service";
import { newCompany } from "./helpers";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Les lignes d'un calcul retombent exactement sur ses totaux. */
function expectConsistent(t: ReturnType<typeof computeTotals>) {
  expect(sum(t.lines.map((l) => l.net))).toBeCloseTo(t.subtotal, 6);
  expect(sum(t.lines.map((l) => l.taxAmount))).toBeCloseTo(t.taxTotal, 6);
  expect(sum(t.lines.map((l) => l.lineTotal))).toBeCloseTo(t.total, 6);
  expect(sum(t.vat.map((v) => v.base))).toBeCloseTo(t.subtotal, 6);
  expect(sum(t.vat.map((v) => v.tax))).toBeCloseTo(t.taxTotal, 6);
}

describe("répartition au plus fort reste", () => {
  it("la somme des parts vaut exactement le montant", () => {
    expect(allocate(100, [1, 1, 1], 0)).toEqual([34, 33, 33]);
    expect(allocate(0.1, [1, 1, 1], 2)).toEqual([0.04, 0.03, 0.03]);
    expect(allocate(250, [1001, 500], 0)).toEqual([167, 83]);
    expect(allocate(7, [0, 0], 0)).toEqual([0, 0]);
    expect(allocate(0, [5, 5], 0)).toEqual([0, 0]);
  });
});

describe("TVA par taux après remise globale", () => {
  const mixed = [
    { quantity: 1, unitPrice: 11800, taxRate: 18 },
    { quantity: 1, unitPrice: 10000, taxRate: 0 },
  ];

  it("mode ligne (prix TTC) : la remise est répartie avant d'extraire la TVA", () => {
    const t = computeTotals(mixed, 2180, 0, "line");
    expect(t.lines.map((l) => l.globalDiscount)).toEqual([1180, 1000]);
    expect(t.lines[0]).toMatchObject({ gross: 11800, lineTotal: 10620, taxAmount: 1620, net: 9000 });
    expect(t.lines[1]).toMatchObject({ gross: 10000, lineTotal: 9000, taxAmount: 0, net: 9000 });
    expect(t.vat).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);
    expect(t).toMatchObject({ subtotal: 18000, taxTotal: 1620, total: 19620, discountTotal: 2180 });
    expectConsistent(t);
  });

  it("mode total (prix HT) : la TVA de chaque taux porte sur la base HT remisée", () => {
    const t = computeTotals(
      [
        { quantity: 1, unitPrice: 10000, taxRate: 18 },
        { quantity: 1, unitPrice: 10000, taxRate: 0 },
      ],
      2000,
      0,
      "total",
    );
    expect(t.vat).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);
    expect(t.lines[0]).toMatchObject({ gross: 10000, globalDiscount: 1000, net: 9000, taxAmount: 1620, lineTotal: 10620 });
    expect(t).toMatchObject({ subtotal: 18000, taxTotal: 1620, total: 19620, discountTotal: 2000 });
    expectConsistent(t);
  });

  it("arrondi en FCFA : la remise tombe juste et la TVA suit la base arrondie", () => {
    // 250 réparti sur 1001 et 500 : 166,72 et 83,28 → 167 et 83 (plus fort reste)
    const t = computeTotals(
      [
        { quantity: 1, unitPrice: 1001, taxRate: 18 },
        { quantity: 1, unitPrice: 500, taxRate: 0 },
      ],
      250,
      0,
      "total",
    );
    expect(t.lines.map((l) => l.globalDiscount)).toEqual([167, 83]);
    expect(t.vat).toEqual([
      { rate: 0, base: 417, tax: 0 },
      { rate: 18, base: 834, tax: 150 },
    ]);
    expect(t).toMatchObject({ subtotal: 1251, taxTotal: 150, total: 1401 });
    expectConsistent(t);

    // trois lignes identiques TTC, remise de 100 : 34 + 33 + 33, jamais 99 ni 101
    const l = computeTotals(
      [
        { quantity: 1, unitPrice: 1180, taxRate: 18 },
        { quantity: 1, unitPrice: 1180, taxRate: 0 },
        { quantity: 1, unitPrice: 1180, taxRate: 18 },
      ],
      100,
      0,
      "line",
    );
    expect(l.lines.map((x) => x.globalDiscount)).toEqual([34, 33, 33]);
    expect(l.total).toBe(3440);
    expect(l.discountTotal).toBe(100);
    expectConsistent(l);
  });

  it("respecte les décimales de la devise et les remises de ligne", () => {
    const t = computeTotals(
      [
        { quantity: 3, unitPrice: 9.99, discount: 0.97, taxRate: 20 },
        { quantity: 1, unitPrice: 5.5, taxRate: 5.5 },
        { quantity: 2, unitPrice: 1, taxRate: 0 },
      ],
      3.33,
      2,
      "total",
    );
    expect(sum(t.lines.map((l) => l.globalDiscount))).toBeCloseTo(3.33, 9);
    expect(t.discountTotal).toBe(4.3);
    expect(t.subtotal).toBe(33.17);
    expectConsistent(t);
    for (const v of t.vat) expect(Math.round(v.tax * 100)).toBeCloseTo(v.tax * 100, 6);
  });

  it("sans remise globale, le calcul reste inchangé", () => {
    const t = computeTotals(mixed, 0, 0, "line");
    expect(t).toMatchObject({ subtotal: 20000, taxTotal: 1800, total: 21800 });
    expect(t.lines[0]).toMatchObject({ lineTotal: 11800, taxAmount: 1800, net: 10000, globalDiscount: 0 });
  });

  it("détail d'un document enregistré : lu dans ses lignes, ignoré pour un ancien document incohérent", () => {
    const items = [
      { taxRate: 18, taxAmount: 1620, lineTotal: 10620 },
      { taxRate: 0, taxAmount: 0, lineTotal: 9000 },
    ];
    expect(storedVatBreakdown(items, { total: 19620, taxTotal: 1620 }, 0)).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);
    // ancienne vente : lignes avant remise globale, TVA de ligne non remisée
    const old = [
      { taxRate: 18, taxAmount: 1800, lineTotal: 11800 },
      { taxRate: 0, taxAmount: 0, lineTotal: 10000 },
    ];
    expect(storedVatBreakdown(old, { total: 19620, taxTotal: 1620 }, 0)).toBeNull();
    expect(vatDetail(old, { total: 19620, taxTotal: 1620 }, "XOF")).toEqual([]);
  });
});

describe("remise globale enregistrée (caisse, facture, rapport)", () => {
  it("vente à 18 % et 0 % avec remise globale : TVA par taux juste partout", async () => {
    const ctx = await newCompany("TVA Remise");
    const a = await createProduct(ctx, { name: "Jus 18", salePrice: 11800, initialStock: 10 });
    const b = await createProduct(ctx, { name: "Riz 0", salePrice: 10000, initialStock: 10, taxId: null });
    const { paymentMethods: pms } = await posBootstrap(ctx);
    const cash = pms.find((p) => p.label === "Espèces")!;

    const res = await createSale(ctx, {
      items: [
        { productId: a, quantity: 1 },
        { productId: b, quantity: 1 },
      ],
      discount: 2180,
      payments: [{ paymentMethodId: cash.id, amount: 19620 }],
    });
    expect(res.total).toBe(19620);

    const { sale, items } = await getSale(ctx, res.id);
    expect(sale).toMatchObject({ subtotal: 18000, taxTotal: 1620, total: 19620, discountTotal: 2180 });
    const jus = items.find((i) => i.name === "Jus 18")!;
    expect(jus).toMatchObject({ taxRate: 18, taxAmount: 1620, lineTotal: 10620 });
    expect(vatDetail(items, sale, ctx.company.currency)).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);

    // la facture issue de la vente reprend les mêmes lignes
    const invId = await createInvoiceFromSale(ctx, res.id);
    const inv = await getInvoice(ctx, invId);
    expect(vatDetail(inv.items, inv.invoice, ctx.company.currency)).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);

    const range = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) };
    const rep = await salesReport(ctx, range);
    expect(rep.byTax).toEqual([
      { rate: 0, base: 9000, tax: 0 },
      { rate: 18, base: 9000, tax: 1620 },
    ]);
    expect(sum(rep.byTax.map((t) => t.tax))).toBe(sum(rep.byDay.map((d) => d.tax)));

    // facture manuelle en mode HT avec remise globale
    await setTaxMode(ctx, "total");
    ctx.company = (await db.select().from(companies).where(eq(companies.id, ctx.companyId)))[0] as typeof ctx.company;
    const manual = await createManualInvoice(ctx, {
      customerName: "Client",
      discount: 250,
      items: [
        { description: "Prestation", quantity: 1, unitPrice: 1001, taxRate: 18 },
        { description: "Formation", quantity: 1, unitPrice: 500, taxRate: 0 },
      ],
    });
    const m = await getInvoice(ctx, manual);
    expect(m.invoice).toMatchObject({ taxMode: "total", subtotal: 1251, taxTotal: 150, total: 1401, discountTotal: 250 });
    expect(vatDetail(m.items, m.invoice, ctx.company.currency)).toEqual([
      { rate: 0, base: 417, tax: 0 },
      { rate: 18, base: 834, tax: 150 },
    ]);
  });
});
