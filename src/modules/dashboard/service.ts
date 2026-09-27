import { and, eq, gte, lt, sql } from "drizzle-orm";
import { localDate, requestTimeZone, zonedDay, zonedMidnight } from "@/lib/dates";
import { customers, expenses, products, stockLevels, suppliers } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";
import { documentsInRange, linesInRange } from "@/modules/reports/service";
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

/** Bornes [from, to[ en heure locale de l'entreprise (fuseau tz). */
export function periodRange(key: PeriodKey, custom?: { from?: string; to?: string }, now = new Date(), tz: string | undefined = requestTimeZone()) {
  const d = (y: number, m: number, day: number) => zonedMidnight(y, m, day, tz);
  const { y, m, d: day, dow } = zonedDay(now, tz);
  const ymd = (s: string) => s.split("-").map(Number) as [number, number, number];
  switch (key) {
    case "today":
      return { from: d(y, m, day), to: d(y, m, day + 1) };
    case "yesterday":
      return { from: d(y, m, day - 1), to: d(y, m, day) };
    case "week": {
      return { from: d(y, m, day - dow), to: d(y, m, day + 1) };
    }
    case "month":
      return { from: d(y, m, 1), to: d(y, m + 1, 1) };
    case "last_month":
      return { from: d(y, m - 1, 1), to: d(y, m, 1) };
    case "year":
      return { from: d(y, 0, 1), to: d(y + 1, 0, 1) };
    case "custom": {
      const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const from = valid(custom?.from) ? (([a, b, c]) => d(a, b - 1, c))(ymd(custom!.from!)) : d(y, m, 1);
      const to = valid(custom?.to) ? (([a, b, c]) => d(a, b - 1, c + 1))(ymd(custom!.to!)) : d(y, m, day + 1);
      return { from, to };
    }
  }
}

export async function dashboardStats(ctx: AppContext, range: { from: Date; to: Date }) {
  ctxAssert(ctx, "dashboard.view");
  const showProfit = ctxCan(ctx, "reports.profit");
  const tz = ctx.company.timezone;
  const startDay = periodRange("today", undefined, new Date(), tz).from;
  const startWeek = periodRange("week", undefined, new Date(), tz).from;
  const startMonth = periodRange("month", undefined, new Date(), tz).from;

  return withTenant(ctx, async (tx) => {
    // Ventes de caisse et factures saisies à la main (voir documentsInRange)
    const far = new Date(Date.now() + 86400_000);
    const revenueSince = async (from: Date) =>
      ((await tx.execute(sql`select coalesce(sum(d.total), 0)::float8 as total from ${documentsInRange({ from, to: far })} d`)).rows[0] as { total: number }).total;

    const period = (
      await tx.execute(sql`
        select coalesce(sum(d.total), 0)::float8 as revenue, count(*)::int as count,
               coalesce(sum(d.cost), 0)::float8 as cost, coalesce(sum(d.tax), 0)::float8 as tax
          from ${documentsInRange(range)} d`)
    ).rows[0] as { revenue: number; count: number; cost: number; tax: number };

    const [exp] = await tx
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, localDate(range.from, tz)), lt(expenses.spentOn, localDate(range.to, tz))));

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
    const trend = (
      await tx.execute(sql`
        select to_char(date_trunc(${bucket}, d.at), 'YYYY-MM-DD') as date, sum(d.total)::float8 as revenue, count(*)::int as count
          from ${documentsInRange(range)} d
         group by 1 order by 1`)
    ).rows as { date: string; revenue: number; count: number }[];

    const top = (
      await tx.execute(sql`
        select l.name, sum(l.quantity)::float8 as quantity, sum(l.line_total)::float8 as revenue
          from ${linesInRange(range)} l
         group by l.name order by sum(l.line_total) desc limit 5`)
    ).rows as { name: string; quantity: number; revenue: number }[];

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
      stockCounts: alerts.counts,
      expiring: alerts.expiring,
    };
  });
}
