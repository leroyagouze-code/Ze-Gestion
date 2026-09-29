import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { localDate } from "@/lib/dates";
import { expenses, invoices, paymentMethods, payments, products, sales, stockLevels } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";

/**
 * Toutes les ventes de la période : ventes de caisse terminées + factures saisies à la main
 * non annulées. Une facture issue d'une vente n'est pas comptée deux fois.
 * Le coût d'une facture vient du prix d'achat actuel de ses articles (une ligne sans article ne coûte rien ici).
 */
export function documentsInRange(range: { from: Date; to: Date }) {
  return sql`(
    select ${sales.createdAt} as at, ${sales.subtotal} as subtotal, ${sales.taxTotal} as tax, ${sales.total} as total,
           ${sales.costTotal} as cost, ${sales.dueAmount} as due
      from ${sales}
     where ${sales.status} = 'completed' and ${sales.createdAt} >= ${range.from} and ${sales.createdAt} < ${range.to}
    union all
    select i.created_at, i.subtotal, i.tax_total, i.total,
           coalesce((select sum(ii.quantity * p.purchase_price) from invoice_items ii join products p on p.id = ii.product_id where ii.invoice_id = i.id), 0),
           greatest(i.total - i.paid_amount, 0)
      from invoices i
     where i.sale_id is null and i.status <> 'cancelled' and i.created_at >= ${range.from} and i.created_at < ${range.to}
  )`;
}

/** Lignes vendues de la période (caisse + factures saisies à la main), pour les classements et la TVA par taux. */
export function linesInRange(range: { from: Date; to: Date }) {
  return sql`(
    select si.name, si.quantity, si.line_total, si.tax_amount, si.tax_rate, si.quantity * si.unit_cost as cost
      from sale_items si join sales s on s.id = si.sale_id
     where s.status = 'completed' and s.created_at >= ${range.from} and s.created_at < ${range.to}
    union all
    select ii.description, ii.quantity, ii.line_total, ii.tax_amount, ii.tax_rate, ii.quantity * coalesce(p.purchase_price, 0)
      from invoice_items ii join invoices i on i.id = ii.invoice_id left join products p on p.id = ii.product_id
     where i.sale_id is null and i.status <> 'cancelled' and i.created_at >= ${range.from} and i.created_at < ${range.to}
  )`;
}

export async function salesReport(ctx: AppContext, range: { from: Date; to: Date }) {
  ctxAssert(ctx, "reports.view");
  const showProfit = ctxCan(ctx, "reports.profit");
  return withTenant(ctx, async (tx) => {
    type Day = { date: string; count: number; subtotal: number; tax: number; total: number; cost: number; due: number };
    const byDay = (
      await tx.execute(sql`
        select to_char(date_trunc('day', d.at), 'YYYY-MM-DD') as date, count(*)::int as count,
               sum(d.subtotal)::float8 as subtotal, sum(d.tax)::float8 as tax, sum(d.total)::float8 as total,
               sum(d.cost)::float8 as cost, sum(d.due)::float8 as due
          from ${documentsInRange(range)} d
         group by 1 order by 1`)
    ).rows as Day[];

    type ProductRow = { name: string; quantity: number; revenue: number; cost: number };
    const byProduct = (
      await tx.execute(sql`
        select l.name, sum(l.quantity)::float8 as quantity, sum(l.line_total)::float8 as revenue, sum(l.cost)::float8 as cost
          from ${linesInRange(range)} l
         group by l.name order by sum(l.line_total) desc limit 100`)
    ).rows as ProductRow[];

    const byPayment = await tx
      .select({ method: paymentMethods.label, total: sql<number>`sum(${payments.amount})::float8`, count: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .where(
        and(
          gte(payments.createdAt, range.from),
          lt(payments.createdAt, range.to),
          // l'argent d'une vente ou d'une facture annulée ne compte plus comme encaissé
          sql`not exists (select 1 from ${sales} where ${sales.id} = ${payments.saleId} and ${sales.status} = 'cancelled')`,
          sql`not exists (select 1 from ${invoices} where ${invoices.id} = ${payments.invoiceId} and ${invoices.status} = 'cancelled')`,
        ),
      )
      .groupBy(paymentMethods.label)
      .orderBy(desc(sql`sum(${payments.amount})`));

    // lineTotal et taxAmount des lignes intègrent la part de remise globale (computeTotals) : base et TVA par taux justes.
    // Les documents plus anciens restent tels qu'ils ont été enregistrés.
    type TaxRow = { rate: number; base: number; tax: number };
    const byTax = (
      await tx.execute(sql`
        select l.tax_rate::float8 as rate, sum(l.line_total - l.tax_amount)::float8 as base, sum(l.tax_amount)::float8 as tax
          from ${linesInRange(range)} l
         group by l.tax_rate order by l.tax_rate`)
    ).rows as TaxRow[];

    const [exp] = await tx
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, localDate(range.from, ctx.company.timezone)), lt(expenses.spentOn, localDate(range.to, ctx.company.timezone))));

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
