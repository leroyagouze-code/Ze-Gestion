import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  customers,
  invoices,
  paymentMethods,
  payments,
  products,
  saleItems,
  sales,
  stores,
  taxes,
  users,
} from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { computeTotals, currencyDecimals, round } from "@/lib/money";
import { pageParams } from "@/lib/pagination";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";
import { nextDocumentNumber } from "@/modules/settings/sequences";
import { applyMovement } from "@/modules/stock/service";

export const saleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive().max(1e6),
        discount: z.number().min(0).default(0),
      }),
    )
    .min(1, "Panier vide"),
  customerId: z.string().uuid().nullish(),
  discount: z.number().min(0).default(0),
  payments: z
    .array(z.object({ paymentMethodId: z.string().uuid(), amount: z.number().min(0), reference: z.string().max(100).nullish() }))
    .default([]),
  notes: z.string().max(1000).nullish(),
});
export type SaleInput = z.input<typeof saleSchema>;

/**
 * Enregistre une vente de caisse en une seule transaction :
 * numéro, lignes (prix lus en base, jamais depuis le navigateur), sortie de stock,
 * paiements, créance client éventuelle, audit.
 */
export async function createSale(ctx: AppContext, raw: SaleInput) {
  ctxAssert(ctx, "sales.create");
  const input = saleSchema.parse(raw);
  const decimals = currencyDecimals(ctx.company.currency);

  return withTenant(ctx, async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const prods = await tx
      .select({
        id: products.id,
        name: products.name,
        salePrice: products.salePrice,
        promoPrice: products.promoPrice,
        purchasePrice: products.purchasePrice,
        taxRate: sql<number>`coalesce(${taxes.rate}, 0)::float8`,
      })
      .from(products)
      .leftJoin(taxes, eq(taxes.id, products.taxId))
      .where(and(inArray(products.id, ids), eq(products.isActive, true)));
    const byId = new Map(prods.map((p) => [p.id, p]));

    const lines = input.items.map((i) => {
      const p = byId.get(i.productId);
      if (!p) throw new BusinessError("Produit introuvable ou désactivé");
      const unitPrice = p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : p.salePrice;
      return { p, quantity: i.quantity, unitPrice, discount: i.discount, taxRate: p.taxRate };
    });
    const totals = computeTotals(lines, input.discount, decimals);
    if (totals.total < 0) throw new BusinessError("Total négatif");

    // Paiements : on n'enregistre pas la monnaie rendue ; le reste dû devient une créance client.
    const methodIds = [...new Set(input.payments.map((p) => p.paymentMethodId))];
    const methods = methodIds.length
      ? await tx.select().from(paymentMethods).where(and(inArray(paymentMethods.id, methodIds), eq(paymentMethods.isEnabled, true)))
      : [];
    if (methods.length !== methodIds.length) throw new BusinessError("Moyen de paiement invalide");
    const methodById = new Map(methods.map((m) => [m.id, m]));
    const tendered = input.payments.filter((p) => methodById.get(p.paymentMethodId)?.type !== "credit");
    const tenderedSum = round(tendered.reduce((s, p) => s + p.amount, 0), decimals);
    const paid = Math.min(tenderedSum, totals.total);
    const due = round(totals.total - paid, decimals);
    const change = round(Math.max(tenderedSum - totals.total, 0), decimals);
    if (due > 0 && !input.customerId) throw new BusinessError("Une vente à crédit ou partiellement payée nécessite un client");

    if (input.customerId) {
      const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId));
      if (!c) throw new NotFoundError("Client");
    }

    const number = await nextDocumentNumber(tx, ctx.companyId, "sale");
    const costTotal = round(lines.reduce((s, l) => s + l.quantity * l.p.purchasePrice, 0), decimals);
    const [sale] = await tx
      .insert(sales)
      .values({
        companyId: ctx.companyId,
        storeId: ctx.storeId,
        number,
        customerId: input.customerId ?? null,
        userId: ctx.userId,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        costTotal,
        paidAmount: paid,
        dueAmount: due,
        notes: input.notes ?? null,
      })
      .returning({ id: sales.id });

    await tx.insert(saleItems).values(
      lines.map((l, idx) => ({
        companyId: ctx.companyId,
        saleId: sale.id,
        productId: l.p.id,
        name: l.p.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRate: l.taxRate,
        taxAmount: totals.lines[idx].taxAmount,
        lineTotal: totals.lines[idx].lineTotal,
        unitCost: l.p.purchasePrice,
      })),
    );

    for (const l of lines) {
      await applyMovement(tx, ctx, {
        storeId: ctx.storeId,
        productId: l.p.id,
        type: "sale",
        quantity: -l.quantity,
        referenceType: "sale",
        referenceId: sale.id,
        reason: number,
      });
    }

    // Répartit le montant encaissé entre les moyens de paiement (la monnaie est retirée du dernier)
    let remaining = paid;
    for (const p of tendered) {
      const amount = Math.min(p.amount, remaining);
      if (amount <= 0) continue;
      remaining = round(remaining - amount, decimals);
      await tx.insert(payments).values({
        companyId: ctx.companyId,
        saleId: sale.id,
        customerId: input.customerId ?? null,
        paymentMethodId: p.paymentMethodId,
        amount,
        reference: p.reference ?? null,
        userId: ctx.userId,
      });
    }

    if (input.customerId) {
      await tx
        .update(customers)
        .set({
          totalSpent: sql`${customers.totalSpent} + ${totals.total}`,
          balanceDue: sql`${customers.balanceDue} + ${due}`,
        })
        .where(eq(customers.id, input.customerId));
    }

    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "sale.created",
      entityType: "sale",
      entityId: sale.id,
      metadata: { number, total: totals.total, due },
      ip: ctx.ip,
    });
    return { id: sale.id, number, total: totals.total, paid, due, change };
  });
}

export async function cancelSale(ctx: AppContext, id: string, reason: string) {
  ctxAssert(ctx, "sales.cancel");
  if (!reason.trim()) throw new BusinessError("Motif d'annulation requis");
  return withTenant(ctx, async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
    if (!sale) throw new NotFoundError("Vente");
    if (sale.status === "cancelled") throw new BusinessError("Vente déjà annulée");
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    for (const it of items) {
      if (!it.productId) continue;
      await applyMovement(tx, ctx, {
        storeId: sale.storeId,
        productId: it.productId,
        type: "sale_cancel",
        quantity: it.quantity,
        referenceType: "sale",
        referenceId: sale.id,
        reason: `Annulation ${sale.number}`,
      });
    }
    await tx.update(sales).set({ status: "cancelled", dueAmount: 0 }).where(eq(sales.id, id));
    await tx.update(invoices).set({ status: "cancelled" }).where(eq(invoices.saleId, id));
    if (sale.customerId) {
      await tx
        .update(customers)
        .set({
          totalSpent: sql`greatest(${customers.totalSpent} - ${sale.total}, 0)`,
          balanceDue: sql`greatest(${customers.balanceDue} - ${sale.dueAmount}, 0)`,
        })
        .where(eq(customers.id, sale.customerId));
    }
    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "sale.cancelled",
      entityType: "sale",
      entityId: id,
      metadata: { number: sale.number, total: sale.total, reason },
      ip: ctx.ip,
    });
  });
}

export async function listSales(ctx: AppContext, opts: { page?: number; from?: Date; to?: Date; customerId?: string }) {
  ctxAssert(ctx, "sales.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    if (opts.from) conds.push(gte(sales.createdAt, opts.from));
    if (opts.to) conds.push(lt(sales.createdAt, opts.to));
    if (opts.customerId) conds.push(eq(sales.customerId, opts.customerId));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await tx
      .select({
        id: sales.id,
        number: sales.number,
        createdAt: sales.createdAt,
        total: sales.total,
        paidAmount: sales.paidAmount,
        dueAmount: sales.dueAmount,
        status: sales.status,
        customerName: customers.name,
        userName: users.fullName,
        storeName: stores.name,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.userId))
      .innerJoin(stores, eq(stores.id, sales.storeId))
      .where(where)
      .orderBy(desc(sales.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(sales).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function getSale(ctx: AppContext, id: string) {
  ctxAssert(ctx, "sales.view");
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ sale: sales, customer: customers, userName: users.fullName, storeName: stores.name })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.userId))
      .innerJoin(stores, eq(stores.id, sales.storeId))
      .where(eq(sales.id, id));
    if (!row) throw new NotFoundError("Vente");
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    const pays = await tx
      .select({ id: payments.id, amount: payments.amount, method: paymentMethods.label, createdAt: payments.createdAt, reference: payments.reference })
      .from(payments)
      .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
      .where(eq(payments.saleId, id));
    const [invoice] = await tx.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.saleId, id)).limit(1);
    const showCost = ctxCan(ctx, "reports.profit");
    return {
      ...row,
      sale: showCost ? row.sale : { ...row.sale, costTotal: 0 },
      items: items.map((i) => (showCost ? i : { ...i, unitCost: 0 })),
      payments: pays,
      invoice: invoice ?? null,
    };
  });
}

export async function posBootstrap(ctx: AppContext) {
  ctxAssert(ctx, "sales.create");
  return withTenant(ctx, async (tx) => ({
    paymentMethods: await tx
      .select({ id: paymentMethods.id, label: paymentMethods.label, type: paymentMethods.type })
      .from(paymentMethods)
      .where(eq(paymentMethods.isEnabled, true))
      .orderBy(paymentMethods.sortOrder),
    customers: await tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .orderBy(customers.name)
      .limit(1000),
  }));
}

/** Moyens de paiement actifs (données de configuration, lisibles par tout membre). */
export async function listPaymentMethods(ctx: AppContext, opts: { excludeCredit?: boolean } = {}) {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: paymentMethods.id, label: paymentMethods.label, type: paymentMethods.type })
      .from(paymentMethods)
      .where(eq(paymentMethods.isEnabled, true))
      .orderBy(paymentMethods.sortOrder),
  );
  return opts.excludeCredit ? rows.filter((r) => r.type !== "credit") : rows;
}
