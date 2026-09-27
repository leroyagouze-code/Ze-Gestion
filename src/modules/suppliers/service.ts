import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { products, stockMovements, suppliers } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { optText } from "@/lib/zod";
import { ctxAssert, type AppContext } from "@/modules/auth/context";

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  companyName: optText(200),
  phone: optText(40),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("Email invalide").nullable()),
  address: optText(500),
  notes: optText(2000),
  balanceDue: z.coerce.number().min(0).optional(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export async function listSuppliers(ctx: AppContext, opts: { q?: string; page?: number }) {
  ctxAssert(ctx, "suppliers.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const where = opts.q ? or(ilike(suppliers.name, `%${opts.q}%`), ilike(suppliers.phone, `%${opts.q}%`)) : undefined;
    const rows = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        companyName: suppliers.companyName,
        phone: suppliers.phone,
        email: suppliers.email,
        balanceDue: suppliers.balanceDue,
        productCount: sql<number>`(select count(*) from ${products} where ${products.supplierId} = ${suppliers.id} and ${products.isActive})::int`,
      })
      .from(suppliers)
      .where(where)
      .orderBy(suppliers.name)
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function getSupplier(ctx: AppContext, id: string) {
  ctxAssert(ctx, "suppliers.view");
  return withTenant(ctx, async (tx) => {
    const [s] = await tx.select().from(suppliers).where(eq(suppliers.id, id));
    if (!s) throw new NotFoundError("Fournisseur");
    const supplied = await tx
      .select({ id: products.id, name: products.name, sku: products.sku, purchasePrice: products.purchasePrice })
      .from(products)
      .where(eq(products.supplierId, id))
      .orderBy(products.name)
      .limit(200);
    const receipts = await tx
      .select({ id: stockMovements.id, createdAt: stockMovements.createdAt, quantity: stockMovements.quantity, unitCost: stockMovements.unitCost, productName: products.name, reason: stockMovements.reason })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .where(sql`${products.supplierId} = ${id} and ${stockMovements.type} in ('in', 'purchase_receipt')`)
      .orderBy(desc(stockMovements.createdAt))
      .limit(50);
    return { supplier: s, products: supplied, receipts };
  });
}

export async function createSupplier(ctx: AppContext, raw: SupplierInput) {
  ctxAssert(ctx, "suppliers.edit");
  const input = supplierSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [s] = await tx.insert(suppliers).values({ companyId: ctx.companyId, ...input, balanceDue: input.balanceDue ?? 0 }).returning({ id: suppliers.id });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "supplier.created", entityType: "supplier", entityId: s.id, metadata: { name: input.name }, ip: ctx.ip });
    return s.id;
  });
}

export async function updateSupplier(ctx: AppContext, id: string, raw: SupplierInput) {
  ctxAssert(ctx, "suppliers.edit");
  const input = supplierSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const res = await tx.update(suppliers).set(input).where(eq(suppliers.id, id)).returning({ id: suppliers.id });
    if (!res.length) throw new NotFoundError("Fournisseur");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "supplier.updated", entityType: "supplier", entityId: id, ip: ctx.ip });
  });
}
