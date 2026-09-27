import { and, desc, eq, sql } from "drizzle-orm";
import { localDate } from "@/lib/dates";
import { contains } from "@/lib/search";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
  customers,
  invoiceItems,
  invoices,
  paymentMethods,
  payments,
  saleItems,
  products,
  sales,
  type CustomerSnapshot,
} from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertCollectMethod, assertOwned } from "@/db/owned";
import { audit } from "@/lib/audit";
import { newToken, getCompany } from "@/lib/auth/session";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { computeTotals, currencyDecimals, isTaxMode, round } from "@/lib/money";
import { pageParams } from "@/lib/pagination";
import { ctxAssert, type AppContext } from "@/modules/auth/context";
import { nextDocumentNumber } from "@/modules/settings/sequences";

const today = (ctx: { company: { timezone: string } }) => localDate(new Date(), ctx.company.timezone);

function snapshot(c: typeof customers.$inferSelect | null | undefined): CustomerSnapshot | null {
  if (!c) return null;
  return { name: c.name, companyName: c.companyName, phone: c.phone, email: c.email, address: c.address, taxId: c.taxId };
}

export async function createInvoiceFromSale(ctx: AppContext, saleId: string) {
  ctxAssert(ctx, "invoices.create");
  return withTenant(ctx, async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!sale) throw new NotFoundError("Vente");
    if (sale.status === "cancelled") throw new BusinessError("Vente annulée");
    const [existing] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.saleId, saleId), sql`${invoices.status} <> 'cancelled'`));
    if (existing) return existing.id;
    const customer = sale.customerId ? (await tx.select().from(customers).where(eq(customers.id, sale.customerId)))[0] : null;
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
    const methods = await tx
      .selectDistinct({ label: paymentMethods.label })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .where(eq(payments.saleId, saleId));
    const number = await nextDocumentNumber(tx, ctx.companyId, "invoice");
    const status = sale.dueAmount <= 0 ? "paid" : sale.paidAmount > 0 ? "partially_paid" : "issued";
    const [inv] = await tx
      .insert(invoices)
      .values({
        companyId: ctx.companyId,
        number,
        saleId,
        customerId: sale.customerId,
        customerSnapshot: snapshot(customer),
        issueDate: today(ctx),
        status,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        taxTotal: sale.taxTotal,
        total: sale.total,
        taxMode: sale.taxMode,
        paidAmount: sale.paidAmount,
        paymentMethodLabel: methods.map((m) => m.label).join(", ") || (sale.dueAmount > 0 ? "Crédit" : null),
        notes: ctx.company.invoiceNotes,
        publicToken: newToken(24),
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    await tx.insert(invoiceItems).values(
      items.map((i) => ({
        companyId: ctx.companyId,
        invoiceId: inv.id,
        productId: i.productId,
        description: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        taxAmount: i.taxAmount,
        lineTotal: i.lineTotal,
      })),
    );
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "invoice.created", entityType: "invoice", entityId: inv.id, metadata: { number, saleId }, ip: ctx.ip });
    return inv.id;
  });
}

export const manualInvoiceSchema = z.object({
  customerId: z.string().uuid().nullish(),
  customerName: z.string().trim().max(200).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  paymentTerms: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  discount: z.number().min(0).default(0),
  /** Correction : facture remplacée, annulée dans la même opération. */
  replacesId: z.string().uuid().nullish(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().nullish(),
        description: z.string().trim().min(1).max(300),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).default(0),
        taxRate: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1, "Au moins une ligne"),
});

/** Facture manuelle (sans vente de caisse) : n'impacte pas le stock, crée une créance client. */
export async function createManualInvoice(ctx: AppContext, raw: z.input<typeof manualInvoiceSchema>) {
  ctxAssert(ctx, "invoices.create");
  const input = manualInvoiceSchema.parse(raw);
  if (input.replacesId) ctxAssert(ctx, "invoices.cancel");
  return withTenant(ctx, async (tx) => {
    let replaced: typeof invoices.$inferSelect | null = null;
    if (input.replacesId) {
      [replaced] = await tx.select().from(invoices).where(eq(invoices.id, input.replacesId)).for("update");
      if (!replaced) throw new NotFoundError("Facture à corriger");
      assertCorrectable(replaced);
      input.notes = [input.notes, `Remplace la facture ${replaced.number}`].filter(Boolean).join("\n");
    }
    const id = await createManualInvoiceInTx(tx, ctx, input);
    if (replaced) {
      const [created] = await tx.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, id));
      await cancelInvoiceInTx(tx, ctx, replaced, `Corrigée : remplacée par ${created.number}`);
    }
    return id;
  });
}

/** Une facture se corrige (annulée et refaite) tant qu'elle vient de la saisie manuelle et n'a reçu aucun paiement. */
export function assertCorrectable(inv: typeof invoices.$inferSelect) {
  if (inv.status === "cancelled") throw new BusinessError("Cette facture est déjà annulée");
  if (inv.saleId) throw new BusinessError("Facture issue d'une vente de caisse : annulez la vente puis refaites-la");
  if (inv.paidAmount > 0) throw new BusinessError("Cette facture a déjà reçu un paiement : annulez-la avec un motif, puis créez la nouvelle facture");
}

/** Création de la facture dans une transaction existante (utilisée aussi pour la correction). */
export async function createManualInvoiceInTx(tx: Tx, ctx: AppContext, input: z.output<typeof manualInvoiceSchema>) {
  const decimals = currencyDecimals(ctx.company.currency);
  const taxMode = isTaxMode(ctx.company.taxMode) ? ctx.company.taxMode : "line";
  const totals = computeTotals(input.items, input.discount, decimals, taxMode);
  {
    const customer = input.customerId ? (await tx.select().from(customers).where(eq(customers.id, input.customerId)))[0] : null;
    if (input.customerId && !customer) throw new NotFoundError("Client");
    for (const i of input.items) await assertOwned(tx, products, i.productId, "Produit");
    const snap = snapshot(customer) ?? (input.customerName ? { name: input.customerName } : null);
    const number = await nextDocumentNumber(tx, ctx.companyId, "invoice");
    const [inv] = await tx
      .insert(invoices)
      .values({
        companyId: ctx.companyId,
        number,
        customerId: customer?.id ?? null,
        customerSnapshot: snap,
        issueDate: today(ctx),
        dueDate: input.dueDate ?? null,
        status: "issued",
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        taxMode,
        paymentTerms: input.paymentTerms ?? null,
        notes: input.notes ?? ctx.company.invoiceNotes,
        publicToken: newToken(24),
        createdBy: ctx.userId,
      })
      .returning({ id: invoices.id });
    await tx.insert(invoiceItems).values(
      input.items.map((i, idx) => ({
        companyId: ctx.companyId,
        invoiceId: inv.id,
        productId: i.productId ?? null,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        taxAmount: totals.lines[idx].taxAmount,
        lineTotal: totals.lines[idx].lineTotal,
      })),
    );
    if (customer) {
      await tx
        .update(customers)
        .set({ balanceDue: sql`${customers.balanceDue} + ${totals.total}`, totalSpent: sql`${customers.totalSpent} + ${totals.total}` })
        .where(eq(customers.id, customer.id));
    }
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "invoice.created", entityType: "invoice", entityId: inv.id, metadata: { number, total: totals.total }, ip: ctx.ip });
    return inv.id;
   }
}

export async function recordInvoicePayment(ctx: AppContext, invoiceId: string, paymentMethodId: string, amount: number, reference?: string | null) {
  ctxAssert(ctx, "invoices.create");
  const decimals = currencyDecimals(ctx.company.currency);
  return withTenant(ctx, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv) throw new NotFoundError("Facture");
    if (inv.saleId) throw new BusinessError("Facture liée à une vente : encaisser la créance depuis la fiche client");
    if (inv.status === "cancelled" || inv.status === "paid") throw new BusinessError("Facture déjà soldée ou annulée");
    await assertCollectMethod(tx, paymentMethodId);
    if (!Number.isFinite(amount)) throw new BusinessError("Montant invalide");
    const pay = round(Math.min(amount, inv.total - inv.paidAmount), decimals);
    if (!(pay > 0)) throw new BusinessError("Montant invalide");
    const paidAmount = round(inv.paidAmount + pay, decimals);
    await tx
      .update(invoices)
      .set({ paidAmount, status: paidAmount >= inv.total ? "paid" : "partially_paid" })
      .where(eq(invoices.id, invoiceId));
    await tx.insert(payments).values({ companyId: ctx.companyId, invoiceId, customerId: inv.customerId, paymentMethodId, amount: pay, reference: reference ?? null, userId: ctx.userId });
    if (inv.customerId) {
      await tx.update(customers).set({ balanceDue: sql`greatest(${customers.balanceDue} - ${pay}, 0)` }).where(eq(customers.id, inv.customerId));
    }
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "invoice.payment", entityType: "invoice", entityId: invoiceId, metadata: { amount: pay }, ip: ctx.ip });
    return pay;
  });
}

export async function cancelInvoice(ctx: AppContext, id: string, reason: string) {
  ctxAssert(ctx, "invoices.cancel");
  if (!reason.trim()) throw new BusinessError("Motif d'annulation requis");
  return withTenant(ctx, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
    if (!inv) throw new NotFoundError("Facture");
    if (inv.status === "cancelled") throw new BusinessError("Facture déjà annulée");
    await cancelInvoiceInTx(tx, ctx, inv, reason);
  });
}

async function cancelInvoiceInTx(tx: Tx, ctx: AppContext, inv: typeof invoices.$inferSelect, reason: string) {
  const id = inv.id;
  {
    // le motif reste lisible sur la facture elle-même (écran et PDF)
    const notes = [inv.notes, `Annulée : ${reason}`].filter(Boolean).join("\n");
    await tx.update(invoices).set({ status: "cancelled", notes }).where(eq(invoices.id, id));
    // Une facture manuelle annulée retire sa créance restante ; celle d'une vente ne touche pas la vente.
    if (!inv.saleId && inv.customerId) {
      const remaining = inv.total - inv.paidAmount;
      await tx
        .update(customers)
        .set({
          balanceDue: sql`greatest(${customers.balanceDue} - ${remaining}, 0)`,
          totalSpent: sql`greatest(${customers.totalSpent} - ${inv.total}, 0)`,
        })
        .where(eq(customers.id, inv.customerId));
    }
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "invoice.cancelled", entityType: "invoice", entityId: id, metadata: { number: inv.number, reason }, ip: ctx.ip });
  }
}

export async function listInvoices(ctx: AppContext, opts: { page?: number; status?: string; q?: string }) {
  ctxAssert(ctx, "invoices.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    if (opts.status) conds.push(sql`${invoices.status} = ${opts.status}`);
    if (opts.q) conds.push(sql`(${invoices.number} ilike ${contains(opts.q)} or ${invoices.customerSnapshot}->>'name' ilike ${contains(opts.q)})`);
    const where = conds.length ? and(...conds) : undefined;
    const rows = await tx
      .select({
        id: invoices.id,
        number: invoices.number,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        total: invoices.total,
        paidAmount: invoices.paidAmount,
        status: invoices.status,
        customer: invoices.customerSnapshot,
      })
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(invoices).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

async function loadInvoice(tx: Parameters<Parameters<typeof withTenant>[1]>[0], id: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) throw new NotFoundError("Facture");
  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  return { invoice, items };
}

export async function getInvoice(ctx: AppContext, id: string) {
  ctxAssert(ctx, "invoices.view");
  return withTenant(ctx, (tx) => loadInvoice(tx, id));
}

/** Facture publique : le jeton (192 bits) identifie la facture et, via une fonction SECURITY DEFINER, son entreprise. */
export async function getPublicInvoice(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const res = await db.execute<{ company_id: string | null }>(sql`select public_invoice_company(${token}) as company_id`);
  const companyId = res.rows[0]?.company_id;
  if (!companyId) return null;
  const company = await getCompany(companyId);
  if (!company || company.status !== "active") return null;
  const data = await withTenant({ companyId, userId: null }, async (tx) => {
    const [row] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.publicToken, token));
    return row ? loadInvoice(tx, row.id) : null;
  });
  return data ? { ...data, company } : null;
}
