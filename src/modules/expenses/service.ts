import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { expenses, paymentMethods, users } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertOwned } from "@/db/owned";
import { isOwnFileUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { num, optText, optUuid } from "@/lib/zod";
import { ctxAssert, type AppContext } from "@/modules/auth/context";

export const EXPENSE_CATEGORIES = [
  "Loyer",
  "Électricité",
  "Eau",
  "Internet",
  "Salaires",
  "Transport",
  "Marketing",
  "Maintenance",
  "Fournitures",
  "Impôts et taxes",
  "Autres dépenses",
];

export const expenseSchema = z.object({
  category: z.string().trim().min(1).max(100),
  amount: num({ min: 0.01 }),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  description: optText(1000),
  paymentMethodId: optUuid,
  attachmentUrl: optText(500),
});

export async function listExpenses(ctx: AppContext, opts: { page?: number }) {
  ctxAssert(ctx, "expenses.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: expenses.id,
        category: expenses.category,
        amount: expenses.amount,
        spentOn: expenses.spentOn,
        description: expenses.description,
        method: paymentMethods.label,
        attachmentUrl: expenses.attachmentUrl,
        userName: users.fullName,
      })
      .from(expenses)
      .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.paymentMethodId))
      .leftJoin(users, eq(users.id, expenses.userId))
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(expenses);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function createExpense(ctx: AppContext, raw: z.input<typeof expenseSchema>) {
  ctxAssert(ctx, "expenses.edit");
  const input = expenseSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    await assertOwned(tx, paymentMethods, input.paymentMethodId, "Moyen de paiement");
    if (input.attachmentUrl && !isOwnFileUrl(input.attachmentUrl, ctx.companyId, "private")) throw new BusinessError("Justificatif invalide");
    const [e] = await tx
      .insert(expenses)
      .values({ companyId: ctx.companyId, storeId: ctx.storeId, userId: ctx.userId, ...input })
      .returning({ id: expenses.id });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "expense.created", entityType: "expense", entityId: e.id, metadata: { amount: input.amount, category: input.category }, ip: ctx.ip });
    return e.id;
  });
}

export async function deleteExpense(ctx: AppContext, id: string) {
  ctxAssert(ctx, "expenses.edit");
  return withTenant(ctx, async (tx) => {
    const [e] = await tx.delete(expenses).where(eq(expenses.id, id)).returning();
    if (!e) throw new NotFoundError("Dépense");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "expense.deleted", entityType: "expense", entityId: id, metadata: { amount: e.amount, category: e.category }, ip: ctx.ip });
  });
}
