import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { contains } from "@/lib/search";
import type { Tx } from "@/db";
import { brands, categories, products, suppliers, taxes } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertOwned } from "@/db/owned";
import { isOwnFileUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { cleanAttributes, getTrade } from "@/lib/trades";
import { pageParams } from "@/lib/pagination";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";
import { applyMovement, totalStockSql } from "@/modules/stock/service";
import { productSchema, type ProductInput } from "./schemas";

async function upsertNamed(tx: Tx, companyId: string, table: typeof categories | typeof brands, name: string | null) {
  if (!name) return null;
  const [found] = await tx
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${name})`)
    .limit(1);
  if (found) return found.id;
  const [created] = await tx.insert(table).values({ companyId, name }).returning({ id: table.id });
  return created.id;
}

function mapUniqueError(e: unknown): never {
  const code = (e as { code?: string; cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
  if (code === "23505") {
    const constraint = (e as { cause?: { constraint?: string } })?.cause?.constraint ?? (e as { constraint?: string })?.constraint;
    if (constraint === "products_company_vin_uq") throw new BusinessError("Ce numéro de châssis (VIN) existe déjà");
    throw new BusinessError("Ce SKU existe déjà pour un autre produit");
  }
  throw e;
}

export async function listProducts(ctx: AppContext, opts: { q?: string; page?: number; categoryId?: string }) {
  ctxAssert(ctx, "products.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const conds = [eq(products.isActive, true)];
    if (opts.q) {
      const q = opts.q.trim();
      conds.push(
        or(
          ilike(products.name, contains(q)),
          eq(products.sku, q),
          eq(products.barcode, q),
          eq(products.reference, q),
          // Taille, couleur, n° de lot, n° de châssis…
          sql`${products.attributes}::text ilike ${contains(q)}`,
        )!,
      );
    }
    if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
    const where = and(...conds);
    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        salePrice: products.salePrice,
        promoPrice: products.promoPrice,
        purchasePrice: products.purchasePrice,
        unit: products.unit,
        minStock: products.minStock,
        attributes: products.attributes,
        expiryDate: products.expiryDate,
        category: categories.name,
        stock: totalStockSql(),
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(products).where(where);
    const canCost = ctxCan(ctx, "products.cost");
    return {
      rows: rows.map((r) => ({ ...r, purchasePrice: canCost ? r.purchasePrice : null })),
      total: count,
      page,
      pageSize: limit,
    };
  });
}

export async function getProduct(ctx: AppContext, id: string) {
  ctxAssert(ctx, "products.view");
  return withTenant(ctx, async (tx) => {
    const [p] = await tx
      .select({
        product: products,
        categoryName: categories.name,
        brandName: brands.name,
        supplierName: suppliers.name,
        stock: totalStockSql(),
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(eq(products.id, id));
    if (!p) throw new NotFoundError("Produit");
    if (!ctxCan(ctx, "products.cost")) p.product.purchasePrice = 0;
    return p;
  });
}

export async function productFormOptions(ctx: AppContext) {
  return withTenant(ctx, async (tx) => ({
    taxes: await tx.select({ id: taxes.id, name: taxes.name, rate: taxes.rate, isDefault: taxes.isDefault }).from(taxes).where(eq(taxes.isActive, true)),
    suppliers: await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name).limit(500),
    categories: await tx.select({ id: categories.id, name: categories.name }).from(categories).orderBy(categories.name),
    brands: await tx.select({ id: brands.id, name: brands.name }).from(brands).orderBy(brands.name),
  }));
}

async function assertRefs(tx: Tx, ctx: AppContext, input: { taxId?: string | null; supplierId?: string | null; imageUrl?: string | null }) {
  if (input.imageUrl && !isOwnFileUrl(input.imageUrl, ctx.companyId, "public")) throw new BusinessError("Image invalide");
  await assertOwned(tx, taxes, input.taxId, "Taxe");
  await assertOwned(tx, suppliers, input.supplierId, "Fournisseur");
}

async function createInTx(tx: Tx, ctx: AppContext, input: ReturnType<typeof productSchema.parse>) {
  await assertRefs(tx, ctx, input);
  const categoryId = await upsertNamed(tx, ctx.companyId, categories, input.categoryName);
  const brandId = await upsertNamed(tx, ctx.companyId, brands, input.brandName);
  const [p] = await tx
    .insert(products)
    .values({
      companyId: ctx.companyId,
      name: input.name,
      reference: input.reference,
      sku: input.sku,
      barcode: input.barcode,
      categoryId,
      brandId,
      description: input.description,
      imageUrl: input.imageUrl,
      purchasePrice: ctxCan(ctx, "products.cost") ? input.purchasePrice : 0,
      salePrice: input.salePrice,
      promoPrice: input.promoPrice,
      taxId: input.taxId,
      minStock: input.minStock,
      unit: input.unit,
      supplierId: input.supplierId,
      expiryDate: input.expiryDate,
      attributes: input.attributes ? cleanAttributes(getTrade(ctx.company.businessType), input.attributes) : {},
    })
    .returning({ id: products.id });
  if (input.initialStock && input.initialStock > 0) {
    await applyMovement(tx, ctx, {
      storeId: ctx.storeId,
      productId: p.id,
      type: "in",
      quantity: input.initialStock,
      reason: "Stock initial",
      unitCost: input.purchasePrice,
    });
  }
  return p.id;
}

export async function createProduct(ctx: AppContext, raw: ProductInput) {
  ctxAssert(ctx, "products.edit");
  const input = productSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    // Sans taxe précisée (API, import), on applique la taxe par défaut de l'entreprise
    if (raw.taxId === undefined) {
      const [def] = await tx.select({ id: taxes.id }).from(taxes).where(eq(taxes.isDefault, true)).limit(1);
      input.taxId = def?.id ?? null;
    }
    const id = await createInTx(tx, ctx, input).catch(mapUniqueError);
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "product.created", entityType: "product", entityId: id, metadata: { name: input.name }, ip: ctx.ip });
    return id;
  });
}

export async function updateProduct(ctx: AppContext, id: string, raw: ProductInput) {
  ctxAssert(ctx, "products.edit");
  const input = productSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id));
    if (!before) throw new NotFoundError("Produit");
    await assertRefs(tx, ctx, input);
    const canCost = ctxCan(ctx, "products.cost");
    const categoryId = await upsertNamed(tx, ctx.companyId, categories, input.categoryName);
    const brandId = await upsertNamed(tx, ctx.companyId, brands, input.brandName);
    await tx
      .update(products)
      .set({
        name: input.name,
        reference: input.reference,
        sku: input.sku,
        barcode: input.barcode,
        categoryId,
        brandId,
        description: input.description,
        imageUrl: input.imageUrl ?? before.imageUrl,
        purchasePrice: canCost ? input.purchasePrice : before.purchasePrice,
        salePrice: input.salePrice,
        promoPrice: input.promoPrice,
        taxId: input.taxId,
        minStock: input.minStock,
        unit: input.unit,
        supplierId: input.supplierId,
        expiryDate: input.expiryDate,
        attributes: input.attributes ? cleanAttributes(getTrade(ctx.company.businessType), input.attributes) : before.attributes,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .catch(mapUniqueError);
    const priceChanges: Record<string, [number | null, number | null]> = {};
    if (before.salePrice !== input.salePrice) priceChanges.salePrice = [before.salePrice, input.salePrice];
    if (canCost && before.purchasePrice !== input.purchasePrice) priceChanges.purchasePrice = [before.purchasePrice, input.purchasePrice];
    if ((before.promoPrice ?? null) !== (input.promoPrice ?? null)) priceChanges.promoPrice = [before.promoPrice, input.promoPrice ?? null];
    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: Object.keys(priceChanges).length ? "product.price_changed" : "product.updated",
      entityType: "product",
      entityId: id,
      metadata: { name: input.name, ...priceChanges },
      ip: ctx.ip,
    });
  });
}

/** Suppression logique : l'historique des ventes garde ses références. */
export async function deleteProduct(ctx: AppContext, id: string) {
  ctxAssert(ctx, "products.delete");
  return withTenant(ctx, async (tx) => {
    const [p] = await tx.update(products).set({ isActive: false, sku: null, updatedAt: new Date() }).where(eq(products.id, id)).returning({ name: products.name });
    if (!p) throw new NotFoundError("Produit");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "product.deleted", entityType: "product", entityId: id, metadata: { name: p.name }, ip: ctx.ip });
  });
}

/** Recherche caisse : code-barres / SKU exacts d'abord, puis nom (index trigram). */
export async function searchForPos(ctx: AppContext, q: string, limit = 20) {
  ctxAssert(ctx, "sales.create");
  const term = q.trim();
  return withTenant(ctx, async (tx) => {
    const cols = {
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      salePrice: products.salePrice,
      promoPrice: products.promoPrice,
      unit: products.unit,
      taxRate: sql<number>`coalesce(${taxes.rate}, 0)::float8`,
      stock: totalStockSql(),
    };
    const base = () =>
      tx.select(cols).from(products).leftJoin(taxes, eq(taxes.id, products.taxId));
    if (!term) return base().where(eq(products.isActive, true)).orderBy(desc(products.updatedAt)).limit(limit);
    const exact = await base()
      .where(
        and(
          eq(products.isActive, true),
          or(eq(products.barcode, term), eq(products.sku, term), eq(products.reference, term), sql`${products.attributes}->>'vin' = ${term.toUpperCase()}`),
        ),
      )
      .limit(limit);
    if (exact.length) return exact;
    return base()
      .where(and(eq(products.isActive, true), ilike(products.name, contains(term))))
      .orderBy(sql`similarity(${products.name}, ${term}) desc`)
      .limit(limit);
  });
}

/* ─────────── Import / export CSV ─────────── */

export const CSV_COLUMNS = [
  "nom",
  "reference",
  "sku",
  "code_barres",
  "categorie",
  "marque",
  "prix_achat",
  "prix_vente",
  "prix_promo",
  "stock_minimum",
  "unite",
  "stock_initial",
  "date_expiration",
] as const;

export async function importProducts(ctx: AppContext, rows: Record<string, string>[]) {
  ctxAssert(ctx, "products.edit");
  const errors: { line: number; message: string }[] = [];
  let created = 0;
  let updated = 0;
  if (rows.length > 5000) throw new BusinessError("5 000 lignes maximum par import");
  await withTenant(ctx, async (tx) => {
    const [defaultTax] = await tx.select({ id: taxes.id }).from(taxes).where(eq(taxes.isDefault, true)).limit(1);
    for (const [i, r] of rows.entries()) {
      const parsed = productSchema.safeParse({
        name: r.nom,
        reference: r.reference,
        sku: r.sku,
        barcode: r.code_barres,
        categoryName: r.categorie,
        brandName: r.marque,
        purchasePrice: r.prix_achat || "0",
        salePrice: r.prix_vente,
        promoPrice: r.prix_promo,
        minStock: r.stock_minimum || "0",
        unit: r.unite || "pièce",
        initialStock: r.stock_initial ?? r.stock_actuel,
        expiryDate: r.date_expiration,
        taxId: defaultTax?.id,
      });
      if (!parsed.success) {
        errors.push({ line: i + 2, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(", ") });
        continue;
      }
      const existing = parsed.data.sku
        ? (await tx.select({ id: products.id }).from(products).where(eq(products.sku, parsed.data.sku)).limit(1))[0]
        : undefined;
      if (existing) {
        await tx
          .update(products)
          .set({
            name: parsed.data.name,
            salePrice: parsed.data.salePrice,
            purchasePrice: ctxCan(ctx, "products.cost") ? parsed.data.purchasePrice : undefined,
            promoPrice: parsed.data.promoPrice,
            barcode: parsed.data.barcode,
            minStock: parsed.data.minStock,
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing.id));
        updated++;
      } else {
        await createInTx(tx, ctx, parsed.data);
        created++;
      }
    }
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "product.imported", metadata: { created, updated, errors: errors.length }, ip: ctx.ip });
  });
  return { created, updated, errors };
}

export async function exportProducts(ctx: AppContext) {
  ctxAssert(ctx, "products.view");
  const canCost = ctxCan(ctx, "products.cost");
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        name: products.name,
        reference: products.reference,
        sku: products.sku,
        barcode: products.barcode,
        category: categories.name,
        brand: brands.name,
        purchasePrice: products.purchasePrice,
        salePrice: products.salePrice,
        promoPrice: products.promoPrice,
        minStock: products.minStock,
        unit: products.unit,
        stock: totalStockSql(),
        expiryDate: products.expiryDate,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(products.isActive, true))
      .orderBy(products.name);
    return rows.map((r) => ({
      nom: r.name,
      reference: r.reference ?? "",
      sku: r.sku ?? "",
      code_barres: r.barcode ?? "",
      categorie: r.category ?? "",
      marque: r.brand ?? "",
      prix_achat: canCost ? r.purchasePrice : "",
      prix_vente: r.salePrice,
      prix_promo: r.promoPrice ?? "",
      stock_minimum: r.minStock,
      unite: r.unit,
      stock_actuel: r.stock,
      date_expiration: r.expiryDate ?? "",
    }));
  });
}
