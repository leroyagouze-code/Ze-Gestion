import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { customers, products, repairOrderItems, repairOrders, taxes, vehicles } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money";
import { pageParams } from "@/lib/pagination";
import { contains } from "@/lib/search";
import { optText } from "@/lib/zod";
import { ctxAssert, type AppContext } from "@/modules/auth/context";
import { createManualInvoiceInTx } from "@/modules/invoices/service";
import { nextDocumentNumber } from "@/modules/settings/sequences";
import { applyMovement, totalStockSql } from "@/modules/stock/service";

/**
 * Garage : un ordre de réparation relie un client, son véhicule (reconnu par l'immatriculation),
 * les pièces posées (sorties du stock à la facturation) et la main-d'œuvre.
 */

export const REPAIR_STATUS = {
  open: { label: "Ouvert", tone: "blue" },
  in_progress: { label: "En cours", tone: "amber" },
  done: { label: "Terminé", tone: "green" },
  invoiced: { label: "Facturé", tone: "gray" },
  cancelled: { label: "Annulé", tone: "red" },
} as const;
export type RepairStatus = keyof typeof REPAIR_STATUS;

const optInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/\s/g, ""))),
  z.number().int("Nombre entier attendu").min(0).max(10_000_000).nullable(),
).optional();
const optDate = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable());
const normPlate = (p: string) => p.toUpperCase().replace(/[^0-9A-Z]/g, "");

export const repairOrderSchema = z
  .object({
    customerId: z.string().uuid().nullish().or(z.literal("").transform(() => null)),
    customerName: optText(200),
    customerPhone: optText(40),
    plate: z.string().trim().min(2, "Immatriculation requise").max(20),
    brand: optText(60),
    model: optText(60),
    year: optInt,
    vin: optText(40),
    mileage: optInt,
    complaint: optText(2000),
    promisedAt: optDate,
  })
  .refine((v) => v.customerId || v.customerName, { message: "Choisissez un client ou saisissez son nom", path: ["customerName"] });

export async function createRepairOrder(ctx: AppContext, raw: z.input<typeof repairOrderSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = repairOrderSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    let customerId = input.customerId ?? null;
    if (customerId) {
      const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      if (!c) throw new NotFoundError("Client");
    } else {
      const [c] = await tx
        .insert(customers)
        .values({ companyId: ctx.companyId, name: input.customerName!, phone: input.customerPhone, whatsapp: input.customerPhone })
        .returning({ id: customers.id });
      customerId = c.id;
    }
    const plate = normPlate(input.plate);
    // Le véhicule est retrouvé par son immatriculation ; un nouveau véhicule est créé sinon
    const [known] = await tx.select().from(vehicles).where(eq(vehicles.plate, plate));
    let vehicleId: string;
    if (known) {
      vehicleId = known.id;
      await tx
        .update(vehicles)
        .set({
          customerId, // le véhicule a pu changer de propriétaire
          brand: input.brand ?? known.brand,
          model: input.model ?? known.model,
          year: input.year ?? known.year,
          vin: input.vin ?? known.vin,
          mileage: input.mileage ?? known.mileage,
        })
        .where(eq(vehicles.id, known.id));
    } else {
      const [v] = await tx
        .insert(vehicles)
        .values({ companyId: ctx.companyId, customerId, plate, brand: input.brand, model: input.model, year: input.year, vin: input.vin, mileage: input.mileage })
        .returning({ id: vehicles.id });
      vehicleId = v.id;
    }
    const number = await nextDocumentNumber(tx, ctx.companyId, "repair_order");
    const [order] = await tx
      .insert(repairOrders)
      .values({
        companyId: ctx.companyId,
        number,
        customerId,
        vehicleId,
        mileage: input.mileage,
        complaint: input.complaint,
        promisedAt: input.promisedAt,
        createdBy: ctx.userId,
      })
      .returning({ id: repairOrders.id });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "repair.created", entityType: "repair_order", entityId: order.id, metadata: { number, plate }, ip: ctx.ip });
    return order.id;
  });
}

export async function listRepairOrders(ctx: AppContext, opts: { q?: string; status?: string; page?: number }) {
  ctxAssert(ctx, "sales.view");
  const { limit, offset, page } = pageParams(opts.page);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    if (opts.status && opts.status in REPAIR_STATUS) conds.push(eq(repairOrders.status, opts.status as RepairStatus));
    else if (opts.status !== "all") conds.push(sql`${repairOrders.status} in ('open', 'in_progress', 'done')`);
    if (opts.q?.trim()) {
      const q = opts.q.trim();
      conds.push(or(ilike(repairOrders.number, contains(q)), ilike(vehicles.plate, contains(normPlate(q) || q)), ilike(customers.name, contains(q)))!);
    }
    const where = conds.length ? and(...conds) : undefined;
    const rows = await tx
      .select({
        id: repairOrders.id,
        number: repairOrders.number,
        status: repairOrders.status,
        createdAt: repairOrders.createdAt,
        promisedAt: repairOrders.promisedAt,
        complaint: repairOrders.complaint,
        customer: customers.name,
        plate: vehicles.plate,
        vehicle: sql<string>`concat_ws(' ', ${vehicles.brand}, ${vehicles.model})`,
        total: sql<number>`coalesce((select sum(i.quantity * i.unit_price) from repair_order_items i where i.repair_order_id = ${repairOrders.id}), 0)::float8`,
      })
      .from(repairOrders)
      .innerJoin(customers, eq(customers.id, repairOrders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, repairOrders.vehicleId))
      .where(where)
      .orderBy(desc(repairOrders.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(repairOrders)
      .innerJoin(customers, eq(customers.id, repairOrders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, repairOrders.vehicleId))
      .where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

export async function getRepairOrder(ctx: AppContext, id: string) {
  ctxAssert(ctx, "sales.view");
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ order: repairOrders, customer: customers, vehicle: vehicles })
      .from(repairOrders)
      .innerJoin(customers, eq(customers.id, repairOrders.customerId))
      .innerJoin(vehicles, eq(vehicles.id, repairOrders.vehicleId))
      .where(eq(repairOrders.id, id));
    if (!row) throw new NotFoundError("Ordre de réparation");
    const items = await tx.select().from(repairOrderItems).where(eq(repairOrderItems.repairOrderId, id)).orderBy(asc(repairOrderItems.createdAt));
    const history = await tx
      .select({ id: repairOrders.id, number: repairOrders.number, createdAt: repairOrders.createdAt, status: repairOrders.status, complaint: repairOrders.complaint })
      .from(repairOrders)
      .where(and(eq(repairOrders.vehicleId, row.vehicle.id), sql`${repairOrders.id} <> ${id}`))
      .orderBy(desc(repairOrders.createdAt))
      .limit(10);
    const sum = (k: "part" | "labor") => round(items.filter((i) => i.kind === k).reduce((s, i) => s + i.quantity * i.unitPrice, 0), 2);
    const parts = sum("part");
    const labor = sum("labor");
    return { ...row, items, history, totals: { parts, labor, total: round(parts + labor, 2) } };
  });
}

/** Pièces proposées sur l'ordre : articles actifs avec leur stock. */
export async function partOptions(ctx: AppContext) {
  ctxAssert(ctx, "sales.create");
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: products.id, name: products.name, salePrice: products.salePrice, promoPrice: products.promoPrice, unit: products.unit, attributes: products.attributes, stock: totalStockSql() })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name))
      .limit(2000),
  );
}

async function lockEditable(tx: Tx, id: string) {
  const [o] = await tx.select().from(repairOrders).where(eq(repairOrders.id, id)).for("update");
  if (!o) throw new NotFoundError("Ordre de réparation");
  if (o.status === "invoiced" || o.status === "cancelled") throw new BusinessError(`Ordre ${REPAIR_STATUS[o.status].label.toLowerCase()} : il ne peut plus être modifié`);
  return o;
}

const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v), z.number());

export const repairItemSchema = z.object({
  kind: z.enum(["part", "labor"]),
  productId: z.string().uuid().nullish().or(z.literal("").transform(() => null)),
  description: optText(300),
  quantity: num.pipe(z.number().positive("Quantité invalide").max(100_000)),
  unitPrice: z.preprocess((v) => (v === "" || v === undefined ? null : v), num.pipe(z.number().min(0)).nullable()).optional(),
});

export async function addRepairItem(ctx: AppContext, orderId: string, raw: z.input<typeof repairItemSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = repairItemSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    await lockEditable(tx, orderId);
    let description = input.description;
    let unitPrice = input.unitPrice;
    let productId: string | null = null;
    if (input.kind === "part") {
      if (!input.productId) throw new BusinessError("Choisissez la pièce");
      const [p] = await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.isActive, true)));
      if (!p) throw new NotFoundError("Pièce");
      productId = p.id;
      description = description ?? p.name;
      unitPrice = unitPrice ?? p.promoPrice ?? p.salePrice;
    } else {
      if (!description) throw new BusinessError("Décrivez le travail effectué");
      if (unitPrice == null) throw new BusinessError("Indiquez le prix de la main-d'œuvre");
    }
    await tx.insert(repairOrderItems).values({ companyId: ctx.companyId, repairOrderId: orderId, kind: input.kind, productId, description: description!, quantity: input.quantity, unitPrice: unitPrice! });
    await tx.update(repairOrders).set({ updatedAt: new Date(), status: sql`case when ${repairOrders.status} = 'open' then 'in_progress'::repair_status else ${repairOrders.status} end` }).where(eq(repairOrders.id, orderId));
  });
}

export async function removeRepairItem(ctx: AppContext, orderId: string, itemId: string) {
  ctxAssert(ctx, "sales.create");
  return withTenant(ctx, async (tx) => {
    await lockEditable(tx, orderId);
    await tx.delete(repairOrderItems).where(and(eq(repairOrderItems.id, itemId), eq(repairOrderItems.repairOrderId, orderId)));
  });
}

export const repairUpdateSchema = z.object({
  diagnosis: optText(4000),
  mileage: optInt,
  promisedAt: optDate,
});

export async function updateRepairOrder(ctx: AppContext, id: string, raw: z.input<typeof repairUpdateSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = repairUpdateSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const o = await lockEditable(tx, id);
    await tx.update(repairOrders).set({ ...input, updatedAt: new Date() }).where(eq(repairOrders.id, id));
    if (input.mileage) await tx.update(vehicles).set({ mileage: input.mileage }).where(eq(vehicles.id, o.vehicleId));
  });
}

export async function setRepairStatus(ctx: AppContext, id: string, status: "open" | "in_progress" | "done" | "cancelled") {
  ctxAssert(ctx, "sales.create");
  return withTenant(ctx, async (tx) => {
    const o = await lockEditable(tx, id);
    await tx.update(repairOrders).set({ status, updatedAt: new Date() }).where(eq(repairOrders.id, id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "repair.status", entityType: "repair_order", entityId: id, metadata: { number: o.number, status }, ip: ctx.ip });
  });
}

/**
 * Facture l'ordre : crée la facture client (pièces au taux de taxe de chaque pièce, main-d'œuvre
 * à la taxe par défaut), sort les pièces du stock et verrouille l'ordre.
 */
export async function invoiceRepairOrder(ctx: AppContext, id: string) {
  ctxAssert(ctx, "invoices.create");
  return withTenant(ctx, async (tx) => {
    const o = await lockEditable(tx, id);
    const items = await tx
      .select({ item: repairOrderItems, taxRate: sql<number>`coalesce(${taxes.rate}, 0)::float8`, productName: products.name })
      .from(repairOrderItems)
      .leftJoin(products, eq(products.id, repairOrderItems.productId))
      .leftJoin(taxes, eq(taxes.id, products.taxId))
      .where(eq(repairOrderItems.repairOrderId, id))
      .orderBy(asc(repairOrderItems.createdAt));
    if (!items.length) throw new BusinessError("Ajoutez au moins une pièce ou une ligne de main-d'œuvre");
    const [def] = await tx.select({ rate: taxes.rate }).from(taxes).where(and(eq(taxes.isDefault, true), eq(taxes.isActive, true))).limit(1);
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, o.vehicleId));
    const vehicleLabel = [v.brand, v.model, v.plate].filter(Boolean).join(" ");
    const invoiceId = await createManualInvoiceInTx(tx, ctx, {
      customerId: o.customerId,
      customerName: null,
      dueDate: null,
      paymentTerms: null,
      notes: [`Ordre de réparation ${o.number} · ${vehicleLabel}${o.mileage ? ` · ${o.mileage.toLocaleString("fr-FR")} km` : ""}`, ctx.company.invoiceNotes].filter(Boolean).join("\n"),
      discount: 0,
      items: items.map(({ item, taxRate }) => ({
        productId: item.productId,
        description: item.kind === "labor" ? `Main-d'œuvre : ${item.description}` : item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
        taxRate: item.kind === "part" && item.productId ? taxRate : (def?.rate ?? 0),
      })),
    });
    // Sortie de stock des pièces posées
    for (const { item } of items) {
      if (item.kind !== "part" || !item.productId) continue;
      const after = await applyMovement(tx, ctx, {
        storeId: ctx.storeId,
        productId: item.productId,
        type: "out",
        quantity: -item.quantity,
        reason: `Ordre de réparation ${o.number}`,
        referenceType: "repair_order",
        referenceId: o.id,
      });
      if (after < 0 && !ctx.company.allowNegativeStock) {
        throw new BusinessError(`Stock insuffisant pour « ${item.description} » : ${round(after + item.quantity, 3)} disponible(s)`);
      }
    }
    await tx.update(repairOrders).set({ status: "invoiced", invoiceId, updatedAt: new Date() }).where(eq(repairOrders.id, id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "repair.invoiced", entityType: "repair_order", entityId: id, metadata: { number: o.number, invoiceId }, ip: ctx.ip });
    return invoiceId;
  });
}

export async function listVehicles(ctx: AppContext, customerId: string) {
  ctxAssert(ctx, "customers.view");
  return withTenant(ctx, (tx) => tx.select().from(vehicles).where(eq(vehicles.customerId, customerId)).orderBy(asc(vehicles.plate)));
}
