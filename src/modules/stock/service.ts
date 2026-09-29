import { and, desc, eq, lte, sql, isNotNull } from "drizzle-orm";
import { contains } from "@/lib/search";
import { z } from "zod";
import type { Tx } from "@/db";
import { products, stockLevels, stockMovements, stores, suppliers, users } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertOwned } from "@/db/owned";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { currencyDecimals, round } from "@/lib/money";
import { num, optNum, optText, optUuid } from "@/lib/zod";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";

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
    supplierId?: string | null;
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
    supplierId: m.supplierId ?? null,
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
  // Entrée uniquement : prix d'achat unitaire et fournisseur de la réception
  unitCost: optNum,
  supplierId: optUuid.optional(),
});

/**
 * Coût moyen pondéré (CMP) après une entrée : le stock existant garde son coût,
 * la quantité reçue arrive à son prix d'achat. Un stock nul ou négatif ne pèse rien.
 */
export function weightedAverageCost(stockBefore: number, oldCost: number, receivedQty: number, unitCost: number, decimals = 2) {
  const base = Math.max(stockBefore, 0);
  if (base + receivedQty <= 0) return round(unitCost, decimals);
  return round((base * oldCost + receivedQty * unitCost) / (base + receivedQty), decimals);
}

/** Fournisseurs proposés dans le formulaire d'entrée de stock. */
export async function receiptFormOptions(ctx: AppContext) {
  ctxAssert(ctx, "stock.adjust");
  return withTenant(ctx, (tx) => tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name).limit(500));
}

export async function recordManualMovement(ctx: AppContext, raw: z.input<typeof movementSchema>) {
  ctxAssert(ctx, "stock.adjust");
  const input = movementSchema.parse(raw);
  const storeId = input.storeId ?? ctx.storeId;
  return withTenant(ctx, async (tx) => {
    await assertOwned(tx, stores, storeId, "Boutique");
    const isIn = input.kind === "in";
    if (!isIn && (input.supplierId || input.unitCost != null)) {
      throw new BusinessError("Le prix d'achat et le fournisseur ne s'indiquent que sur une entrée de stock");
    }
    // Le prix d'achat n'est pris en compte que pour ceux qui ont le droit de voir les coûts
    const unitCost = isIn && ctxCan(ctx, "products.cost") ? (input.unitCost ?? null) : null;
    const supplierId = isIn ? (input.supplierId ?? null) : null;
    await assertOwned(tx, suppliers, supplierId, "Fournisseur");
    // Verrou sur le produit : deux entrées simultanées ne doivent pas calculer le CMP sur le même coût de départ
    const [p] = await tx
      .select({ id: products.id, name: products.name, purchasePrice: products.purchasePrice, supplierId: products.supplierId })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
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
      unitCost,
      supplierId,
    });
    if (after < 0 && delta < 0 && !ctx.company.allowNegativeStock) {
      throw new BusinessError(`Stock insuffisant : ${Math.round((after - delta) * 1000) / 1000} disponible(s)`);
    }
    let newCost: number | undefined;
    if (isIn && (unitCost != null || (supplierId && !p.supplierId))) {
      const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
      if (unitCost != null) {
        // Stock toutes boutiques avant l'entrée : le coût d'achat du produit est unique pour l'entreprise
        const [{ total }] = await tx
          .select({ total: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::float8` })
          .from(stockLevels)
          .where(eq(stockLevels.productId, p.id));
        newCost = weightedAverageCost(total - delta, p.purchasePrice, delta, unitCost, currencyDecimals(ctx.company.currency));
        patch.purchasePrice = newCost;
      }
      // Premier fournisseur connu : il devient le fournisseur habituel du produit
      if (supplierId && !p.supplierId) patch.supplierId = supplierId;
      await tx.update(products).set(patch).where(eq(products.id, p.id));
    }
    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "stock.movement",
      entityType: "product",
      entityId: p.id,
      metadata: {
        name: p.name,
        kind: input.kind,
        delta,
        after,
        reason: input.reason,
        ...(unitCost != null && { unitCost, costBefore: p.purchasePrice, costAfter: newCost }),
        ...(supplierId && { supplierId }),
      },
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
    if (opts.q) conds.push(sql`(${products.name} ilike ${contains(opts.q)} or ${products.sku} = ${opts.q} or ${products.barcode} = ${opts.q})`);
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
        unitCost: stockMovements.unitCost,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        productId: products.id,
        productName: products.name,
        storeName: stores.name,
        userName: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(stores, eq(stores.id, stockMovements.storeId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .leftJoin(suppliers, eq(suppliers.id, stockMovements.supplierId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(stockMovements).where(where);
    const canCost = ctxCan(ctx, "products.cost");
    return { rows: rows.map((r) => ({ ...r, unitCost: canCost ? r.unitCost : null })), total: count, page, pageSize: limit };
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
    const [counts] = await tx
      .select({
        out: sql<number>`count(*) filter (where ${total} <= 0)::int`,
        low: sql<number>`count(*) filter (where ${total} > 0 and ${total} <= ${products.minStock})::int`,
      })
      .from(products)
      .where(eq(products.isActive, true));
    return { low, expiring, counts };
  });
}

