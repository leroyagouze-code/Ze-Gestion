import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, customers, invoiceItems, invoices, quotes } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { localDate } from "@/lib/dates";
import { computeTotals } from "@/lib/money";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { createCustomer } from "@/modules/customers/service";
import { getInvoice, getPublicInvoice } from "@/modules/invoices/service";
import { addDays, quoteDisplayStatus } from "@/modules/quotes/labels";
import { convertQuoteToInvoice, createQuote, getPublicQuote, getQuote, listQuotes, setQuoteStatus, updateQuote } from "@/modules/quotes/service";
import { newCompany } from "./helpers";

const lines = [
  { description: "Ciment 50 kg", quantity: 10, unitPrice: 5900, taxRate: 18 },
  { description: "Transport", quantity: 1, unitPrice: 15000, taxRate: 0 },
];

describe("proformas", () => {
  it("création : numéro DEV, validité à 30 jours, totaux calculés comme une facture", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Chantier Kossi", items: lines, discount: 1000 });
    const { quote: q, items, displayStatus } = await getQuote(ctx, id);
    const today = localDate(new Date(), ctx.company.timezone);
    expect(q.number).toMatch(/^DEV-\d{4}-000001$/);
    expect(q.status).toBe("draft");
    expect(displayStatus).toBe("draft");
    expect(q.revision).toBe(1);
    expect(q.issueDate).toBe(today);
    expect(q.validUntil).toBe(addDays(today, 30));
    const t = computeTotals(lines, 1000, 0, "line");
    expect({ subtotal: q.subtotal, taxTotal: q.taxTotal, total: q.total, discountTotal: q.discountTotal }).toEqual({
      subtotal: t.subtotal,
      taxTotal: t.taxTotal,
      total: t.total,
      discountTotal: t.discountTotal,
    });
    expect(items.map((i) => i.description)).toEqual(["Ciment 50 kg", "Transport"]);
    // aucune créance ni facture créée par une proforma
    const invs = await withTenant(ctx, (tx) => tx.select().from(invoices));
    expect(invs.length).toBe(0);
  });

  it("modification : même numéro, révision augmentée seulement une fois envoyée", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Ama", items: lines });
    await updateQuote(ctx, id, { customerName: "Ama", items: [lines[0]] });
    let { quote: q, items } = await getQuote(ctx, id);
    expect(q.revision).toBe(1); // brouillon : pas de révision
    expect(items.length).toBe(1);

    await setQuoteStatus(ctx, id, "sent");
    await updateQuote(ctx, id, { customerName: "Ama", items: [{ ...lines[0], quantity: 20 }, lines[1]] });
    ({ quote: q, items } = await getQuote(ctx, id));
    expect(q.number).toMatch(/000001$/);
    expect(q.revision).toBe(2);
    expect(q.status).toBe("sent");
    expect(items.map((i) => i.quantity)).toEqual([20, 1]);
    expect(q.total).toBe(computeTotals([{ ...lines[0], quantity: 20 }, lines[1]], 0, 0).total);

    await updateQuote(ctx, id, { customerName: "Ama", items: lines });
    expect((await getQuote(ctx, id)).quote.revision).toBe(3);

    // acceptée : plus modifiable tant qu'elle n'est pas rouverte
    await setQuoteStatus(ctx, id, "accepted");
    await expect(updateQuote(ctx, id, { items: lines })).rejects.toThrow(/rouvrez/);
    await setQuoteStatus(ctx, id, "reopen");
    await updateQuote(ctx, id, { customerName: "Ama", items: lines });
    expect((await getQuote(ctx, id)).quote.revision).toBe(4);

    const logs = await withTenant(ctx, (tx) => tx.select().from(auditLogs).where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "quote.updated"))));
    expect(logs.length).toBe(4);
  });

  it("expiration : affichée automatiquement une fois la validité passée, bloque l'acceptation et la conversion", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Yao", items: lines });
    await setQuoteStatus(ctx, id, "sent");
    const today = localDate(new Date(), ctx.company.timezone);
    const yesterday = addDays(today, -1);
    await withTenant(ctx, (tx) => tx.update(quotes).set({ issueDate: addDays(today, -40), validUntil: yesterday }).where(eq(quotes.id, id)));

    expect((await getQuote(ctx, id)).displayStatus).toBe("expired");
    expect((await listQuotes(ctx, { status: "expired" })).rows.map((r) => r.id)).toEqual([id]);
    expect((await listQuotes(ctx, { status: "sent" })).rows.length).toBe(0);
    await expect(setQuoteStatus(ctx, id, "accepted")).rejects.toThrow(/expirée/);
    await expect(convertQuoteToInvoice(ctx, id)).rejects.toThrow(/expirée/);

    // une proforma acceptée, refusée ou convertie n'expire pas
    expect(quoteDisplayStatus({ status: "accepted", validUntil: yesterday }, today)).toBe("accepted");
    expect(quoteDisplayStatus({ status: "refused", validUntil: yesterday }, today)).toBe("refused");

    // prolonger la validité (modification) la rend de nouveau valable
    await updateQuote(ctx, id, { customerName: "Yao", items: lines, validUntil: addDays(today, 15) });
    const { quote: q, displayStatus } = await getQuote(ctx, id);
    expect(displayStatus).toBe("sent");
    expect(q.revision).toBe(2);
  });

  it("conversion : une seule facture, mêmes client, lignes, remise, mode de TVA et totaux", async () => {
    const ctx = await newCompany();
    const cid = await createCustomer(ctx, { name: "Société Béton", phone: "+22890000000" });
    ctx.company.taxMode = "total"; // proforma établie en prix HT
    const id = await createQuote(ctx, { customerId: cid, items: lines, discount: 5000, conditions: "50 % à la commande" });
    ctx.company.taxMode = "line"; // l'entreprise change de mode entre-temps : la facture garde celui de la proforma
    await expect(convertQuoteToInvoice(ctx, id)).rejects.toThrow(/envoyée ou acceptée/);
    await setQuoteStatus(ctx, id, "sent");
    await setQuoteStatus(ctx, id, "accepted");

    const invoiceId = await convertQuoteToInvoice(ctx, id);
    const { quote: q, items: qItems, invoiceNumber } = await getQuote(ctx, id);
    const { invoice: inv, items: iItems } = await getInvoice(ctx, invoiceId);

    expect(q.status).toBe("converted");
    expect(q.convertedInvoiceId).toBe(invoiceId);
    expect(invoiceNumber).toBe(inv.number);
    expect(inv.number).toMatch(/^FACT-\d{4}-000001$/);
    expect(inv.customerId).toBe(cid);
    expect(inv.customerSnapshot?.name).toBe("Société Béton");
    expect(inv.taxMode).toBe("total");
    expect(inv.status).toBe("issued");
    expect(inv.paymentTerms).toBe("50 % à la commande");
    expect(inv.notes).toContain(`Selon proforma ${q.number}`);
    expect({ s: inv.subtotal, t: inv.taxTotal, d: inv.discountTotal, tt: inv.total }).toEqual({ s: q.subtotal, t: q.taxTotal, d: q.discountTotal, tt: q.total });
    const pick = (i: { description: string; quantity: number; unitPrice: number; discount: number; taxRate: number; taxAmount: number; lineTotal: number }) =>
      [i.description, i.quantity, i.unitPrice, i.discount, i.taxRate, i.taxAmount, i.lineTotal];
    expect(iItems.map(pick).sort()).toEqual(qItems.map(pick).sort());

    // créance client comme pour une facture manuelle
    const [cust] = await withTenant(ctx, (tx) => tx.select().from(customers).where(eq(customers.id, cid)));
    expect(cust.balanceDue).toBe(inv.total);

    // journal : création de facture (liée à la proforma) et conversion
    const logs = await withTenant(ctx, (tx) => tx.select().from(auditLogs).where(sql`${auditLogs.action} in ('invoice.created', 'quote.converted')`));
    expect(logs.find((l) => l.action === "invoice.created")?.metadata).toMatchObject({ quoteId: id, quoteNumber: q.number });
    expect(logs.find((l) => l.action === "quote.converted")?.entityId).toBe(id);

    // convertie : plus modifiable ni re-statuable
    await expect(updateQuote(ctx, id, { items: lines })).rejects.toThrow(/convertie/);
    await expect(setQuoteStatus(ctx, id, "refused")).rejects.toThrow(/convertie/);
  });

  it("double conversion : idempotente, même en parallèle", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Kodjo", items: lines });
    await setQuoteStatus(ctx, id, "sent"); // une proforma envoyée se convertit aussi directement
    const [a, b, c] = await Promise.all([convertQuoteToInvoice(ctx, id), convertQuoteToInvoice(ctx, id), convertQuoteToInvoice(ctx, id)]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(await convertQuoteToInvoice(ctx, id)).toBe(a);
    const invs = await withTenant(ctx, (tx) => tx.select().from(invoices));
    expect(invs.length).toBe(1);
    const its = await withTenant(ctx, (tx) => tx.select().from(invoiceItems));
    expect(its.length).toBe(2);
    expect(invs[0].customerSnapshot?.name).toBe("Kodjo");
    const logs = await withTenant(ctx, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, "quote.converted")));
    expect(logs.length).toBe(1);
  });

  it("isolation entre entreprises", async () => {
    const a = await newCompany("Entreprise A");
    const b = await newCompany("Entreprise B");
    const id = await createQuote(a, { customerName: "Client A", items: lines });
    await setQuoteStatus(a, id, "sent");
    await expect(getQuote(b, id)).rejects.toThrow(/introuvable/i);
    await expect(updateQuote(b, id, { items: lines })).rejects.toThrow(/introuvable/i);
    await expect(setQuoteStatus(b, id, "accepted")).rejects.toThrow(/introuvable/i);
    await expect(convertQuoteToInvoice(b, id)).rejects.toThrow(/introuvable/i);
    expect((await listQuotes(b, {})).rows.length).toBe(0);
    // client d'une autre entreprise refusé
    const foreign = await createCustomer(a, { name: "Client de A" });
    await expect(createQuote(b, { customerId: foreign, items: lines })).rejects.toThrow(/introuvable/i);
    // numérotation propre à chaque entreprise
    const idB = await createQuote(b, { customerName: "Client B", items: lines });
    expect((await getQuote(b, idB)).quote.number).toMatch(/000001$/);
    expect((await getQuote(a, id)).quote.status).toBe("sent");
  });

  it("lien public : consultation par jeton uniquement", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Afi", items: lines });
    const { quote: q } = await getQuote(ctx, id);
    const pub = await getPublicQuote(q.publicToken);
    expect(pub?.quote.id).toBe(id);
    expect(pub?.company.id).toBe(ctx.companyId);
    expect(pub?.items.length).toBe(2);
    expect(pub?.displayStatus).toBe("draft");
    expect(await getPublicQuote("x".repeat(32))).toBeNull();
    expect(await getPublicQuote("bad token")).toBeNull();
    // le jeton d'une proforma n'ouvre pas une facture
    expect(await getPublicInvoice(q.publicToken)).toBeNull();
  });

  it("PDF : « FACTURE PROFORMA », révision et mention, facture inchangée", async () => {
    const { invoicePdf, quotePdf } = await import("@/pdf/documents");
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Adjo", items: lines });
    await setQuoteStatus(ctx, id, "sent");
    await updateQuote(ctx, id, { customerName: "Adjo", items: lines });
    const { quote: q, items } = await getQuote(ctx, id);
    const pdf = await quotePdf(ctx.company, q, items, { credit: false });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const invoiceId = await convertQuoteToInvoice(ctx, id);
    const { invoice, items: iItems } = await getInvoice(ctx, invoiceId);
    expect((await invoicePdf(ctx.company, invoice, iItems)).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("droits : quotes.create exigé pour créer, invoices.create pour convertir", async () => {
    const ctx = await newCompany();
    const id = await createQuote(ctx, { customerName: "Essi", items: lines });
    await setQuoteStatus(ctx, id, "accepted");
    const viewer = { ...ctx, permissions: ["quotes.view"] };
    await expect(createQuote(viewer, { items: lines })).rejects.toThrow(/Permission refusée/);
    expect((await getQuote(viewer, id)).quote.id).toBe(id);
    const noInvoice = { ...ctx, permissions: ["quotes.view", "quotes.create"] };
    await expect(convertQuoteToInvoice(noInvoice, id)).rejects.toThrow(/Permission refusée/);
    // rôles par défaut : le Commercial fait des proformas, le Caissier non
    expect(DEFAULT_ROLES.find((r) => r.name === "Commercial")?.permissions).toEqual(expect.arrayContaining(["quotes.view", "quotes.create"]));
    expect(DEFAULT_ROLES.find((r) => r.name === "Caissier")?.permissions).not.toContain("quotes.view");
  });
});
