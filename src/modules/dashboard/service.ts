import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { localDate } from "@/lib/dates";
import { customers, expenses, products, saleItems, sales, stockLevels, suppliers } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";
import { stockAlerts } from "@/modules/stock/service";

export type PeriodKey = "today" | "yesterday" | "week" | "month" | "last_month" | "year" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  week: "Cette semaine",
  month: "Ce mois",
  last_month: "Mois précédent",
  year: "Cette année",
  custom: "Période personnalisée",
};

/** Bornes [from, to[ en heure locale du serveur. */
export function periodRange(key: PeriodKey, custom?: { from?: string; to?: string }, now = new Date()) {
  const d = (y: number, m: number, day: number) => new Date(y, m, day);
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();
  switch (key) {
    case "today":
      return { from: d(y, m, day), to: d(y, m, day + 1) };
    case "yesterday":
      return { from: d(y, m, day - 1), to: d(y, m, day) };
    case "week": {
      const dow = (now.getDay() + 6) % 7; // lundi = 0
      return { from: d(y, m, day - dow), to: d(y, m, day + 1) };
    }
    case "month":
      return { from: d(y, m, 1), to: d(y, m + 1, 1) };
    case "last_month":
      return { from: d(y, m - 1, 1), to: d(y, m, 1) };
    case "year":
      return { from: d(y, 0, 1), to: d(y + 1, 0, 1) };
    case "custom": {
      const from = custom?.from ? new Date(custom.from + "T00:00:00") : d(y, m, 1);
      const to = custom?.to ? new Date(new Date(custom.to + "T00:00:00").getTime() + 86400_000) : d(y, m, day + 1);
      return { from, to };
    }
  }
}

export async function dashboardStats(ctx: AppContext, range: { from: Date; to: Date }) {
  ctxAssert(ctx, "dashboard.view");
  const showProfit = ctxCan(ctx, "reports.profit");
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startDay.getTime() - ((now.getDay() + 6) % 7) * 86400_000);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const done = eq(sales.status, "completed");

  return withTenant(ctx, async (tx) => {
    const revenueSince = (from: Date) =>
      tx
        .select({ total: sql<number>`coalesce(sum(${sales.total}), 0)::float8` })
        .from(sales)
        .where(and(done, gte(sales.createdAt, from)))
        .then((r) => r[0].total);

    const inRange = and(done, gte(sales.createdAt, range.from), lt(sales.createdAt, range.to));
    const [period] = await tx
      .select({
        revenue: sql<number>`coalesce(sum(${sales.total}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(${sales.costTotal}), 0)::float8`,
        tax: sql<number>`coalesce(sum(${sales.taxTotal}), 0)::float8`,
      })
      .from(sales)
      .where(inRange);

    const [exp] = await tx
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, localDate(range.from)), lt(expenses.spentOn, localDate(range.to))));

    const [stock] = await tx
      .select({
        products: sql<number>`(select count(*) from ${products} where ${products.isActive})::int`,
        value: sql<number>`coalesce(sum(${stockLevels.quantity} * ${products.purchasePrice}) filter (where ${stockLevels.quantity} > 0), 0)::float8`,
      })
      .from(stockLevels)
      .innerJoin(products, eq(products.id, stockLevels.productId));

    const [cust] = await tx
      .select({ count: sql<number>`count(*)::int`, debt: sql<number>`coalesce(sum(${customers.balanceDue}), 0)::float8` })
      .from(customers);
    const [supp] = await tx.select({ debt: sql<number>`coalesce(sum(${suppliers.balanceDue}), 0)::float8` }).from(suppliers);

    const days = Math.ceil((range.to.getTime() - range.from.getTime()) / 86400_000);
    const bucket = days > 62 ? "month" : "day";
    const trend = await tx
      .select({
        date: sql<string>`to_char(date_trunc(${bucket}, ${sales.createdAt}), 'YYYY-MM-DD')`,
        revenue: sql<number>`sum(${sales.total})::float8`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(inRange)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const top = await tx
      .select({
        name: saleItems.name,
        quantity: sql<number>`sum(${saleItems.quantity})::float8`,
        revenue: sql<number>`sum(${saleItems.lineTotal})::float8`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(inRange)
      .groupBy(saleItems.name)
      .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
      .limit(5);

    const alerts = await stockAlerts(ctx, 8);
    const outOfStock = alerts.low.filter((p) => p.quantity <= 0);
    const lowStock = alerts.low.filter((p) => p.quantity > 0);

    const grossProfit = period.revenue - period.tax - period.cost;
    return {
      revenueToday: await revenueSince(startDay),
      revenueWeek: await revenueSince(startWeek),
      revenueMonth: await revenueSince(startMonth),
      period: { ...period, expenses: exp.total, profit: showProfit ? grossProfit - exp.total : null },
      productCount: stock?.products ?? 0,
      stockValue: showProfit || ctxCan(ctx, "products.cost") ? (stock?.value ?? 0) : null,
      customerCount: cust.count,
      customerDebt: cust.debt,
      supplierDebt: supp.debt,
      trend,
      bucket,
      top,
      outOfStock,
      lowStock,
      expiring: alerts.expiring,
    };
  });
}
