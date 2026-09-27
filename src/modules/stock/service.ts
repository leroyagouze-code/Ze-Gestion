import { and, desc, eq, lte, sql, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { products, stockLevels, stockMovements, stores, users } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { num, optText } from "@/lib/zod";
import { ctxAssert, type AppContext } from "@/modules/auth/context";

type MovementType = (typeof stockMovements.$inferInsert)["type"];

/**
 * Applique un mouvement de stock (quantité signée) dans la transaction courante.
 * Verrouille la ligne stock_levels pour éviter les ventes concurrentes incohérentes.
 */
export async function applyMovement(
  tx: Tx,
  ctx: { companyId: string; userId: string | null },
  m: {
    storeId: string;
    productId: string;
    type: MovementType;
    quantity: number;
    reason?: string | null;
    unitCost?: number | null;
    referenceType?: string;
    referenceId?: string;
  },
) {
  await tx
    .insert(stockLevels)
    .values({ companyId: ctx.companyId, storeId: m.storeId, productId: m.productId, quantity: 0 })
    .onConflictDoNothing();
  const [level] = await tx
    .select({ quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.storeId, m.storeId), eq(stockLevels.productId, m.productId)))
    .for("update");
  const after = Math.round((level.quantity + m.quantity) * 1000) / 1000;
  await tx
    .update(stockLevels)
    .set({ quantity: after, updatedAt: new Date() })
    .where(and(eq(stockLevels.storeId, m.storeId), eq(stockLevels.productId, m.productId)));
  await tx.insert(stockMovements).values({
    companyId: ctx.companyId,
    storeId: m.storeId,
    productId: m.productId,
    type: m.type,
    quantity: m.quantity,
    quantityAfter: after,
    unitCost: m.unitCost ?? null,
    reason: m.reason ?? null,
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    userId: ctx.userId,
  });
  return after;
}

export const movementSchema = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid().optional(),
  kind: z.enum(["in", "out", "adjustment", "inventory"]),
  // in/out : quantité positive ; adjustment : écart signé ; inventory : quantité comptée
  quantity: num({ min: -1e9 }),
  reason: optText(300),
  unitCost: num().optional(),
});

export async function recordManualMovement(ctx: AppContext, raw: z.input<typeof movementSchema>) {
  ctxAssert(ctx, "stock.adjust");
  const input = movementSchema.parse(raw);
  const storeId = input.storeId ?? ctx.storeId;
  return withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, input.productId));
    if (!p) throw new NotFoundError("Produit");
    let delta: number;
    if (input.kind === "in") delta = Math.abs(input.quantity);
    else if (input.kind === "out") delta = -Math.abs(input.quantity);
    else if (input.kind === "adjustment") delta = input.quantity;
    else {
      const [lvl] = await tx
        .select({ q: stockLevels.quantity })
        .from(stockLevels)
        .where(and(eq(stockLevels.storeId, storeId), eq(stockLevels.productId, p.id)));
      delta = input.quantity - (lvl?.q ?? 0);
    }
    if (delta === 0 && input.kind !== "inventory") throw new BusinessError("Quantité nulle");
    const after = await applyMovement(tx, ctx, {
      storeId,
      productId: p.id,
      type: input.kind,
      quantity: delta,
      reason: input.reason,
      unitCost: input.unitCost ?? null,
    });
    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "stock.movement",
      entityType: "product",
      entityId: p.id,
      metadata: { name: p.name, kind: input.kind, delta, after, reason: input.reason },
      ip: ctx.ip,
    });
    return after;
  });
}

/** Quantité totale (toutes boutiques) par produit, en sous-requête réutilisable. */
export function totalStockSql() {
  return sql<number>`coalesce((select sum(${stockLevels.quantity}) from ${stockLevels} where ${stockLevels.productId} = ${products.id}), 0)::float8`;
}

export async function listStock(
  ctx: AppContext,
  opts: { q?: string; filter?: "all" | "low" | "out"; page?: number },
) {
  ctxAssert(ctx, "stock.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const qtyExpr = sql<number>`coalesce(${stockLevels.quantity}, 0)::float8`;
    const conds = [eq(products.isActive, true)];
    if (opts.q) conds.push(sql`(${products.name} ilike ${"%" + opts.q + "%"} or ${products.sku} = ${opts.q} or ${products.barcode} = ${opts.q})`);
    if (opts.filter === "low") conds.push(sql`${qtyExpr} > 0 and ${qtyExpr} <= ${products.minStock}`);
    if (opts.filter === "out") conds.push(sql`${qtyExpr} <= 0`);
    const where = and(...conds);
    const base = tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        minStock: products.minStock,
        purchasePrice: products.purchasePrice,
        quantity: qtyExpr,
      })
      .from(products)
      .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.storeId, ctx.storeId)))
      .where(where);
    const rows = await base.orderBy(products.name).limit(limit).offset(offset);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.storeId, ctx.storeId)))
      .where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function listMovements(ctx: AppContext, opts: { productId?: string; page?: number }) {
  ctxAssert(ctx, "stock.view");
  const { limit, offset, page } = pageParams(opts.page, 50);
  return withTenant(ctx, async (tx) => {
    const where = opts.productId ? eq(stockMovements.productId, opts.productId) : undefined;
    const rows = await tx
      .select({
        id: stockMovements.id,
        createdAt: stockMovements.createdAt,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        quantityAfter: stockMovements.quantityAfter,
        reason: stockMovements.reason,
        productId: products.id,
        productName: products.name,
        storeName: stores.name,
        userName: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(stores, eq(stores.id, stockMovements.storeId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(stockMovements).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function stockAlerts(ctx: AppContext, limit = 10) {
  return withTenant(ctx, async (tx) => {
    const total = totalStockSql();
    const low = await tx
      .select({ id: products.id, name: products.name, quantity: total, minStock: products.minStock, unit: products.unit })
      .from(products)
      .where(and(eq(products.isActive, true), sql`${total} <= ${products.minStock}`))
      .orderBy(total)
      .limit(limit);
    const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const expiring = await tx
      .select({ id: products.id, name: products.name, expiryDate: products.expiryDate })
      .from(products)
      .where(and(eq(products.isActive, true), isNotNull(products.expiryDate), lte(products.expiryDate, in30)))
      .orderBy(products.expiryDate)
      .limit(limit);
    return { low, expiring };
  });
}

