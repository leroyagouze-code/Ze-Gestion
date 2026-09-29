import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { currencyDecimals, round } from "@/lib/money";
import { contains } from "@/lib/search";
import { z } from "zod";
import { customers, invoices, payments, paymentMethods, sales } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertCollectMethod } from "@/db/owned";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { num, optText } from "@/lib/zod";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  companyName: optText(200),
  phone: optText(40),
  whatsapp: optText(40),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("Email invalide").nullable()),
  address: optText(500),
  taxId: optText(100),
  notes: optText(2000),
});
export type CustomerInput = z.input<typeof customerSchema>;

export async function listCustomers(ctx: AppContext, opts: { q?: string; page?: number; withDebt?: boolean }) {
  ctxAssert(ctx, "customers.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    if (opts.q) conds.push(or(ilike(customers.name, contains(opts.q)), ilike(customers.phone, contains(opts.q)), ilike(customers.companyName, contains(opts.q))));
    if (opts.withDebt) conds.push(sql`${customers.balanceDue} > 0`);
    const where = conds.length ? and(...conds) : undefined;
    const rows = await tx.select().from(customers).where(where).orderBy(customers.name).limit(limit).offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(customers).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function getCustomer(ctx: AppContext, id: string) {
  ctxAssert(ctx, "customers.view");
  return withTenant(ctx, async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, id));
    if (!c) throw new NotFoundError("Client");
    const recentSales = await tx
      .select({ id: sales.id, number: sales.number, total: sales.total, dueAmount: sales.dueAmount, status: sales.status, createdAt: sales.createdAt })
      .from(sales)
      .where(eq(sales.customerId, id))
      .orderBy(desc(sales.createdAt))
      .limit(50);
    const recentInvoices = await tx
      .select({ id: invoices.id, number: invoices.number, total: invoices.total, paidAmount: invoices.paidAmount, status: invoices.status, issueDate: invoices.issueDate })
      .from(invoices)
      .where(eq(invoices.customerId, id))
      .orderBy(desc(invoices.createdAt))
      .limit(50);
    const recentPayments = await tx
      .select({ id: payments.id, amount: payments.amount, method: paymentMethods.label, createdAt: payments.createdAt, reference: payments.reference })
      .from(payments)
      .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .where(eq(payments.customerId, id))
      .orderBy(desc(payments.createdAt))
      .limit(50);
    return { customer: c, sales: recentSales, invoices: recentInvoices, payments: recentPayments };
  });
}

export async function createCustomer(ctx: AppContext, raw: CustomerInput) {
  if (!ctxCan(ctx, "customers.create")) ctxAssert(ctx, "customers.edit");
  const input = customerSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [c] = await tx.insert(customers).values({ companyId: ctx.companyId, ...input }).returning({ id: customers.id });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "customer.created", entityType: "customer", entityId: c.id, metadata: { name: input.name }, ip: ctx.ip });
    return c.id;
  });
}

export async function updateCustomer(ctx: AppContext, id: string, raw: CustomerInput) {
  ctxAssert(ctx, "customers.edit");
  const input = customerSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const res = await tx.update(customers).set(input).where(eq(customers.id, id)).returning({ id: customers.id });
    if (!res.length) throw new NotFoundError("Client");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "customer.updated", entityType: "customer", entityId: id, ip: ctx.ip });
  });
}

/** Encaissement d'une créance client (règlement d'une vente à crédit). */
export const debtPaymentSchema = z.object({
  customerId: z.string().uuid(),
  paymentMethodId: z.string().uuid(),
  amount: num().pipe(z.number().positive("Montant invalide")),
  reference: optText(100),
});

export async function recordCustomerPayment(ctx: AppContext, raw: z.input<typeof debtPaymentSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = debtPaymentSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, input.customerId)).for("update");
    if (!c) throw new NotFoundError("Client");
    await assertCollectMethod(tx, input.paymentMethodId);
    const amount = Math.min(input.amount, c.balanceDue);
    if (amount <= 0) return 0;
    const base = { companyId: ctx.companyId, customerId: c.id, paymentMethodId: input.paymentMethodId, reference: input.reference, userId: ctx.userId };
    // Imputation sur ce qui reste dû, du plus ancien au plus récent : ventes à crédit et factures
    const dueSales = await tx
      .select({ id: sales.id, dueAmount: sales.dueAmount, paidAmount: sales.paidAmount, at: sales.createdAt })
      .from(sales)
      .where(and(eq(sales.customerId, c.id), eq(sales.status, "completed"), sql`${sales.dueAmount} > 0`))
      .for("update");
    const dueInvoices = await tx
      .select({ id: invoices.id, total: invoices.total, paidAmount: invoices.paidAmount, at: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.customerId, c.id), isNull(invoices.saleId), inArray(invoices.status, ["issued", "partially_paid"]), sql`${invoices.total} > ${invoices.paidAmount}`))
      .for("update");
    const open = [
      ...dueSales.map((x) => ({ kind: "sale" as const, id: x.id, due: x.dueAmount, paid: x.paidAmount, at: x.at })),
      ...dueInvoices.map((x) => ({ kind: "invoice" as const, id: x.id, due: x.total - x.paidAmount, paid: x.paidAmount, at: x.at, total: x.total })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const d = currencyDecimals(ctx.company.currency);
    let left = amount;
    for (const o of open) {
      if (left <= 0) break;
      const part = round(Math.min(left, o.due), d);
      if (o.kind === "sale") {
        const paid = round(o.paid + part, d);
        await tx.update(sales).set({ dueAmount: round(o.due - part, d), paidAmount: paid }).where(eq(sales.id, o.id));
        await tx.insert(payments).values({ ...base, saleId: o.id, amount: part });
        // la facture de la vente suit : payée, en partie payée
        const [inv] = await tx.select({ id: invoices.id, total: invoices.total, status: invoices.status }).from(invoices).where(eq(invoices.saleId, o.id)).limit(1);
        if (inv && inv.status !== "cancelled") {
          await tx.update(invoices).set({ paidAmount: paid, status: paid >= inv.total ? "paid" : "partially_paid" }).where(eq(invoices.id, inv.id));
        }
      } else {
        const paid = round(o.paid + part, d);
        await tx.update(invoices).set({ paidAmount: paid, status: paid >= o.total! ? "paid" : "partially_paid" }).where(eq(invoices.id, o.id));
        await tx.insert(payments).values({ ...base, invoiceId: o.id, amount: part });
      }
      left = round(left - part, d);
    }
    // Reste d'une dette saisie à la main (solde d'ouverture) : paiement rattaché au seul client
    if (left > 0) await tx.insert(payments).values({ ...base, amount: left });
    await tx.update(customers).set({ balanceDue: sql`${customers.balanceDue} - ${amount}` }).where(eq(customers.id, c.id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "customer.payment", entityType: "customer", entityId: c.id, metadata: { amount }, ip: ctx.ip });
    return amount;
  });
}

export async function customerOptions(ctx: AppContext) {
  ctxAssert(ctx, "customers.view");
  return withTenant(ctx, (tx) => tx.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name).limit(2000));
}

/** Chiffres seuls d'un numéro saisi : « 07 12-34 » et « 071234 » désignent le même client. */
const digitsOnly = (v: string) => v.replace(/\D/g, "");
/** Même normalisation côté SQL, pour comparer les numéros enregistrés. */
const phoneDigits = (col: typeof customers.phone | typeof customers.whatsapp) => sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;

export type PosCustomer = { id: string; name: string; phone: string | null; balanceDue: number };

/**
 * Recherche d'un client depuis la caisse, au fil de la frappe (nom, société ou téléphone).
 * Réservée à qui peut vendre : le caissier n'a pas besoin de consulter les fiches clients.
 */
export async function searchCustomersForPos(ctx: AppContext, q: string, limit = 12): Promise<PosCustomer[]> {
  ctxAssert(ctx, "sales.create");
  const term = q.trim().slice(0, 100);
  const digits = digitsOnly(term);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    if (term) {
      conds.push(
        ilike(customers.name, contains(term)),
        ilike(customers.companyName, contains(term)),
        ilike(customers.phone, contains(term)),
        ilike(customers.whatsapp, contains(term)),
      );
      if (digits.length >= 3) {
        conds.push(sql`${phoneDigits(customers.phone)} like ${contains(digits)}`);
        conds.push(sql`${phoneDigits(customers.whatsapp)} like ${contains(digits)}`);
      }
    }
    return tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone, balanceDue: customers.balanceDue })
      .from(customers)
      .where(conds.length ? or(...conds) : undefined)
      .orderBy(term ? customers.name : desc(customers.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  });
}

export const posCustomerSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  phone: z
    .string()
    .trim()
    .max(40, "Numéro trop long")
    .refine((v) => digitsOnly(v).length >= 6, "Numéro de téléphone requis"),
});

/**
 * Création rapide d'un client depuis la caisse (nom + téléphone), sans quitter la vente.
 * Exige « Ajouter des clients » ; refuse un numéro déjà enregistré pour éviter les doublons.
 */
export async function createCustomerFromPos(ctx: AppContext, raw: z.input<typeof posCustomerSchema>): Promise<PosCustomer> {
  ctxAssert(ctx, "sales.create");
  ctxAssert(ctx, "customers.create");
  const input = posCustomerSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [dup] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(sql`${phoneDigits(customers.phone)} = ${digitsOnly(input.phone)}`)
      .limit(1);
    if (dup) throw new BusinessError(`Ce numéro est déjà celui de « ${dup.name} » : recherchez ce client`);
    const [c] = await tx
      .insert(customers)
      .values({ companyId: ctx.companyId, name: input.name, phone: input.phone })
      .returning({ id: customers.id, name: customers.name, phone: customers.phone, balanceDue: customers.balanceDue });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "customer.created", entityType: "customer", entityId: c.id, metadata: { name: input.name, from: "pos" }, ip: ctx.ip });
    return c;
  });
}
