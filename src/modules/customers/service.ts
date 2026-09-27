import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { customers, invoices, payments, paymentMethods, sales } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { optText } from "@/lib/zod";
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
    if (opts.q) conds.push(or(ilike(customers.name, `%${opts.q}%`), ilike(customers.phone, `%${opts.q}%`), ilike(customers.companyName, `%${opts.q}%`)));
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
  amount: z.coerce.number().positive("Montant invalide"),
  reference: optText(100),
});

export async function recordCustomerPayment(ctx: AppContext, raw: z.input<typeof debtPaymentSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = debtPaymentSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, input.customerId)).for("update");
    if (!c) throw new NotFoundError("Client");
    const amount = Math.min(input.amount, c.balanceDue);
    if (amount <= 0) return 0;
    // Imputation sur les ventes les plus anciennes restant dues
    const due = await tx
      .select({ id: sales.id, dueAmount: sales.dueAmount, paidAmount: sales.paidAmount })
      .from(sales)
      .where(and(eq(sales.customerId, c.id), eq(sales.status, "completed"), sql`${sales.dueAmount} > 0`))
      .orderBy(sales.createdAt)
      .for("update");
    let left = amount;
    for (const s of due) {
      if (left <= 0) break;
      const part = Math.min(left, s.dueAmount);
      await tx.update(sales).set({ dueAmount: s.dueAmount - part, paidAmount: s.paidAmount + part }).where(eq(sales.id, s.id));
      await tx.insert(payments).values({ companyId: ctx.companyId, saleId: s.id, customerId: c.id, paymentMethodId: input.paymentMethodId, amount: part, reference: input.reference, userId: ctx.userId });
      left -= part;
    }
    await tx.update(customers).set({ balanceDue: sql`${customers.balanceDue} - ${amount}` }).where(eq(customers.id, c.id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "customer.payment", entityType: "customer", entityId: c.id, metadata: { amount }, ip: ctx.ip });
    return amount;
  });
}

export async function customerOptions(ctx: AppContext) {
  ctxAssert(ctx, "customers.view");
  return withTenant(ctx, (tx) => tx.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name).limit(2000));
}
