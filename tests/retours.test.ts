import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appInstalls, companies, invoices, paymentMethods, payments, taxes } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { ALL_COUNTRIES, getCountry, isTimeZone } from "@/lib/countries";
import { localDate } from "@/lib/dates";
import { computeTotals } from "@/lib/money";
import { signup } from "@/modules/auth/service";
import { loadContext } from "@/modules/auth/context";
import { periodRange } from "@/modules/dashboard/service";
import { recordInstall } from "@/modules/installs/service";
import { cancelInvoice, createManualInvoice, getInvoice, recordInvoicePayment } from "@/modules/invoices/service";
import { createCustomer, getCustomer, recordCustomerPayment } from "@/modules/customers/service";
import { createProduct } from "@/modules/products/service";
import { createSale } from "@/modules/sales/service";
import { dashboardStats } from "@/modules/dashboard/service";
import { salesReport } from "@/modules/reports/service";
import { setTaxMode, setVisibleModules } from "@/modules/settings/service";
import { newCompany } from "./helpers";

describe("TVA ligne par ligne ou sur le total HT", () => {
  it("ligne par ligne : prix TTC, TVA extraite", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 11800, taxRate: 18 }], 0, 0, "line");
    expect(t).toMatchObject({ subtotal: 10000, taxTotal: 1800, total: 11800 });
  });

  it("sur le total HT : prix HT, TVA calculée une fois par taux et répartie sur les lignes", () => {
    // 3 lignes à 333 HT : TVA ligne par ligne = 3 × 60 = 180 ; sur le total = 999 × 18 % = 179,82 → 180 arrondi
    const t = computeTotals(
      [
        { quantity: 1, unitPrice: 333.33, taxRate: 18 },
        { quantity: 1, unitPrice: 333.33, taxRate: 18 },
        { quantity: 1, unitPrice: 333.34, taxRate: 18 },
        { quantity: 2, unitPrice: 500, taxRate: 0 },
      ],
      0,
      2,
      "total",
    );
    expect(t.subtotal).toBe(2000);
    expect(t.taxTotal).toBe(180);
    expect(t.total).toBe(2180);
    expect(t.lines.reduce((s, l) => s + l.taxAmount, 0)).toBeCloseTo(180, 2);
    expect(t.lines[3]).toMatchObject({ lineTotal: 1000, taxAmount: 0, net: 1000 });
  });

  it("remise globale en mode HT : la TVA porte sur le HT après remise", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 10000, taxRate: 18 }], 1000, 0, "total");
    expect(t).toMatchObject({ subtotal: 9000, taxTotal: 1620, total: 10620, discountTotal: 1000 });
  });

  it("la facture garde le mode du moment où elle est émise", async () => {
    const ctx = await newCompany("TVA Test");
    await setTaxMode(ctx, "total");
    ctx.company = (await db.select().from(companies).where(eq(companies.id, ctx.companyId)))[0] as typeof ctx.company;
    const id = await createManualInvoice(ctx, { customerName: "Client", items: [{ description: "Service", quantity: 2, unitPrice: 5000, taxRate: 18 }] });
    const { invoice, items } = await getInvoice(ctx, id);
    expect(invoice).toMatchObject({ taxMode: "total", subtotal: 10000, taxTotal: 1800, total: 11800 });
    expect(items[0]).toMatchObject({ unitPrice: 5000, lineTotal: 11800, taxAmount: 1800 });
    await expect(setTaxMode(ctx, "autre")).rejects.toThrow(/inconnu/);
  });
});

describe("corriger une facture", () => {
  it("crée la facture corrigée et annule l'ancienne dans la même opération", async () => {
    const ctx = await newCompany("Correction Test");
    const oldId = await createManualInvoice(ctx, { customerName: "Ama", items: [{ description: "Sac de riz", quantity: 1, unitPrice: 5000 }] });
    const old = (await getInvoice(ctx, oldId)).invoice;
    const newId = await createManualInvoice(ctx, { customerName: "Ama", replacesId: oldId, items: [{ description: "Sac de riz", quantity: 2, unitPrice: 5000 }] });
    const [before, after] = [(await getInvoice(ctx, oldId)).invoice, (await getInvoice(ctx, newId)).invoice];
    expect(before.status).toBe("cancelled");
    expect(after.total).toBe(10000);
    expect(after.notes).toContain(`Remplace la facture ${old.number}`);
    // une facture annulée ne se corrige plus
    await expect(createManualInvoice(ctx, { customerName: "Ama", replacesId: oldId, items: [{ description: "X", quantity: 1, unitPrice: 1 }] })).rejects.toThrow(/déjà annulée/);
  });

  it("refuse une facture déjà payée, sans rien créer", async () => {
    const ctx = await newCompany("Correction Payée");
    const id = await createManualInvoice(ctx, { customerName: "Kofi", items: [{ description: "Service", quantity: 1, unitPrice: 5000 }] });
    const [pm] = await withTenant(ctx, (tx) => tx.select().from(paymentMethods).limit(1));
    await recordInvoicePayment(ctx, id, pm.id, 1000);
    await expect(createManualInvoice(ctx, { customerName: "Kofi", replacesId: id, items: [{ description: "Service", quantity: 1, unitPrice: 4000 }] })).rejects.toThrow(/paiement/);
    expect((await getInvoice(ctx, id)).invoice.status).not.toBe("cancelled");
    const count = await withTenant(ctx, (tx) => tx.select().from(invoices));
    expect(count).toHaveLength(1);
  });
});

describe("modules affichés", () => {
  it("enregistre les modules décochés et garde au moins un module", async () => {
    const ctx = await newCompany("Modules Test");
    expect(await setVisibleModules(ctx, ["pos", "sales", "products", "customers", "reports"])).toEqual(["invoices", "stock", "suppliers", "expenses"]);
    await expect(setVisibleModules(ctx, [])).rejects.toThrow(/au moins/);
  });
});

describe("tous les pays", () => {
  it("chaque pays a une devise et un fuseau valides", () => {
    expect(ALL_COUNTRIES.length).toBeGreaterThan(240);
    for (const c of ALL_COUNTRIES) {
      expect(c.currency, c.code).toMatch(/^[A-Z]{3}$/);
      expect(isTimeZone(c.timezone), `${c.code} ${c.timezone}`).toBe(true);
    }
    expect(getCountry("TG")).toMatchObject({ name: "Togo", currency: "XOF", timezone: "Africa/Lome", vat: 18 });
    expect(getCountry("FR")?.currency).toBe("EUR");
  });

  it("l'inscription règle devise, fuseau et TVA selon le pays", async () => {
    const res = await signup({ companyName: "Lagos Shop", ownerName: "Ada", email: `t-${randomUUID()}@test.local`, password: "motdepasse123", country: "NG", currency: "NGN" });
    const ctx = (await loadContext({ userId: res.userId, fullName: "Ada", email: "x", isSuperAdmin: false }, res.companyId))!;
    expect(ctx.company).toMatchObject({ country: "NG", currency: "NGN", timezone: "Africa/Lagos" });
    const rates = await withTenant(ctx, (tx) => tx.select().from(taxes));
    expect(rates.find((t) => t.isDefault)?.rate).toBe(7.5);
  });

  it("les périodes suivent l'heure locale de l'entreprise", () => {
    // 23 h 30 le 1er mars à Lagos (UTC+1) = 22 h 30 UTC : « aujourd'hui » est bien le 1er mars à Lagos
    const now = new Date("2026-03-01T22:30:00Z");
    expect(periodRange("today", undefined, now, "Africa/Lagos").from.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    // Paris passe à l'heure d'été le 29 mars 2026 : mars fait 31 jours moins une heure
    const r = periodRange("month", undefined, new Date("2026-03-15T12:00:00Z"), "Europe/Paris");
    expect(r.from.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-03-31T22:00:00.000Z");
    expect(localDate(now, "Asia/Tokyo")).toBe("2026-03-02");
  });
});

describe("installations", () => {
  it("enregistre puis met à jour une installation sans doublon", async () => {
    const id = `T${randomUUID().slice(0, 3)}-${randomUUID().slice(0, 4)}`.toUpperCase();
    await recordInstall({ installId: id, version: "1.0.0", os: "Windows_NT 10", country: "ci", companyName: null });
    await recordInstall({ installId: id, version: "1.1.0", companyName: "Boutique Abidjan", licensed: true }, "CI");
    const [row] = await db.select().from(appInstalls).where(eq(appInstalls.installId, id));
    expect(row).toMatchObject({ version: "1.1.0", country: "CI", companyName: "Boutique Abidjan", licensed: true, pings: 2 });
    await expect(recordInstall({ installId: "pas un code" })).rejects.toThrow();
  });
});

describe("dette client et chiffre d'affaires", () => {
  it("le paiement d'un client solde aussi ses factures, du plus ancien au plus récent", async () => {
    const ctx = await newCompany("Dette Test");
    const [pm] = await withTenant(ctx, (tx) => tx.select().from(paymentMethods).where(eq(paymentMethods.type, "cash")).limit(1));
    const customerId = await createCustomer(ctx, { name: "Kodjo" });
    const pid = await createProduct(ctx, { name: "Riz", salePrice: 10000, initialStock: 5 });
    const [credit] = await withTenant(ctx, (tx) => tx.select().from(paymentMethods).where(eq(paymentMethods.type, "credit")).limit(1));
    await createSale(ctx, { customerId, items: [{ productId: pid, quantity: 1 }], payments: [{ paymentMethodId: credit.id, amount: 10000 }] });
    const invId = await createManualInvoice(ctx, { customerId, items: [{ description: "Tenues pour mariage", quantity: 1, unitPrice: 45000 }] });
    expect((await getCustomer(ctx, customerId)).customer.balanceDue).toBe(55000);

    await recordCustomerPayment(ctx, { customerId, paymentMethodId: pm.id, amount: "45 000" });
    const inv = (await getInvoice(ctx, invId)).invoice;
    expect(inv).toMatchObject({ paidAmount: 35000, status: "partially_paid" });
    expect((await getCustomer(ctx, customerId)).customer.balanceDue).toBe(10000);
    const pays = await withTenant(ctx, (tx) => tx.select().from(payments).where(eq(payments.customerId, customerId)));
    expect(pays.filter((p) => p.paymentMethodId === pm.id).reduce((s, p) => s + p.amount, 0)).toBe(45000);
  });

  it("les factures comptent dans le chiffre d'affaires et la TVA", async () => {
    const ctx = await newCompany("CA Test");
    await createManualInvoice(ctx, { customerName: "Client", items: [{ description: "Prestation", quantity: 1, unitPrice: 11800, taxRate: 18 }] });
    const cancelled = await createManualInvoice(ctx, { customerName: "Client", items: [{ description: "Erreur", quantity: 1, unitPrice: 5000 }] });
    await cancelInvoice(ctx, cancelled, "erreur");
    const range = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) };
    const stats = await dashboardStats(ctx, range);
    expect(stats.period).toMatchObject({ revenue: 11800, tax: 1800, count: 1 });
    const rep = await salesReport(ctx, range);
    expect(rep.byTax.find((t) => t.rate === 18)?.tax).toBe(1800);
    expect(rep.byProduct[0]).toMatchObject({ name: "Prestation", revenue: 11800 });
  });
});
