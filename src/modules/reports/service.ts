import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { localDate } from "@/lib/dates";
import { expenses, paymentMethods, payments, products, saleItems, sales, stockLevels } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";

export async function salesReport(ctx: AppContext, range: { from: Date; to: Date }) {
  ctxAssert(ctx, "reports.view");
  const showProfit = ctxCan(ctx, "reports.profit");
  return withTenant(ctx, async (tx) => {
    const inRange = and(eq(sales.status, "completed"), gte(sales.createdAt, range.from), lt(sales.createdAt, range.to));
    const byDay = await tx
      .select({
        date: sql<string>`to_char(date_trunc('day', ${sales.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        subtotal: sql<number>`sum(${sales.subtotal})::float8`,
        tax: sql<number>`sum(${sales.taxTotal})::float8`,
        total: sql<number>`sum(${sales.total})::float8`,
        cost: sql<number>`sum(${sales.costTotal})::float8`,
        due: sql<number>`sum(${sales.dueAmount})::float8`,
      })
      .from(sales)
      .where(inRange)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const byProduct = await tx
      .select({
        name: saleItems.name,
        quantity: sql<number>`sum(${saleItems.quantity})::float8`,
        revenue: sql<number>`sum(${saleItems.lineTotal})::float8`,
        cost: sql<number>`sum(${saleItems.quantity} * ${saleItems.unitCost})::float8`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(inRange)
      .groupBy(saleItems.name)
      .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
      .limit(100);

    const byPayment = await tx
      .select({ method: paymentMethods.label, total: sql<number>`sum(${payments.amount})::float8`, count: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .where(and(gte(payments.createdAt, range.from), lt(payments.createdAt, range.to)))
      .groupBy(paymentMethods.label)
      .orderBy(desc(sql`sum(${payments.amount})`));

    const byTax = await tx
      .select({
        rate: saleItems.taxRate,
        base: sql<number>`sum(${saleItems.lineTotal} - ${saleItems.taxAmount})::float8`,
        tax: sql<number>`sum(${saleItems.taxAmount})::float8`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(inRange)
      .groupBy(saleItems.taxRate)
      .orderBy(saleItems.taxRate);

    const [exp] = await tx
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, localDate(range.from)), lt(expenses.spentOn, localDate(range.to))));

    const strip = <T extends { cost: number }>(r: T) => (showProfit ? r : { ...r, cost: 0 });
    return { byDay: byDay.map(strip), byProduct: byProduct.map(strip), byPayment, byTax, expenses: exp.total, showProfit };
  });
}

export async function stockReport(ctx: AppContext) {
  ctxAssert(ctx, "reports.view");
  const showCost = ctxCan(ctx, "products.cost");
  return withTenant(ctx, (tx) =>
    tx
      .select({
        name: products.name,
        sku: products.sku,
        quantity: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::float8`,
        purchasePrice: products.purchasePrice,
        salePrice: products.salePrice,
      })
      .from(products)
      .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
      .where(eq(products.isActive, true))
      .groupBy(products.id)
      .orderBy(products.name)
      .limit(10000)
      .then((rows) => rows.map((r) => ({ ...r, purchasePrice: showCost ? r.purchasePrice : null }))),
  );
}
