import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leases, owners, properties, tenants, units } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { assertCan } from "@/lib/permissions";
import { amount, optText, optUuid, reqText, uuid } from "@/lib/zod";
import { getScopedProperty, getScopedUnit, propertyScope, type Scope } from "../access";
import type { StaffCtx } from "../auth/context";
import { audit } from "../audit/service";

/* ─────────── Biens / immeubles ─────────── */

export const propertySchema = z.object({
  name: reqText("Nom du bien", 120),
  address: optText(200),
  city: reqText("Ville", 80),
  district: optText(80),
  description: optText(1000),
  ownerId: optUuid,
});

async function resolveOwner(ctx: StaffCtx, ownerId: string | null) {
  if (ownerId) {
    const [o] = await db.select().from(owners).where(and(eq(owners.id, ownerId), eq(owners.organizationId, ctx.orgId))).limit(1);
    if (!o) throw new NotFoundError("Propriétaire");
    return o;
  }
  // Propriétaire indépendant : sa propre fiche
  const all = await db.select().from(owners).where(eq(owners.organizationId, ctx.orgId)).limit(2);
  if (all.length === 1) return all[0];
  throw new BusinessError("Choisissez le propriétaire du bien.");
}

export async function createProperty(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "property.write");
  const input = propertySchema.parse(raw);
  const owner = await resolveOwner(ctx, input.ownerId);
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(properties)
      .values({ organizationId: ctx.orgId, ownerId: owner.id, name: input.name, address: input.address, city: input.city, district: input.district, description: input.description })
      .returning();
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "property.create", summary: `Bien « ${p.name} » créé`, entityType: "property", entityId: p.id, ip: ctx.ip });
    return p;
  });
}

export async function updateProperty(ctx: StaffCtx, propertyId: string, raw: unknown) {
  assertCan(ctx.permissions, "property.write");
  const input = propertySchema.parse(raw);
  const before = await getScopedProperty(ctx, propertyId);
  const owner = input.ownerId ? await resolveOwner(ctx, input.ownerId) : { id: before.ownerId };
  await db.transaction(async (tx) => {
    await tx
      .update(properties)
      .set({ name: input.name, address: input.address, city: input.city, district: input.district, description: input.description, ownerId: owner.id })
      .where(eq(properties.id, propertyId));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "property.update",
      summary: `Bien « ${input.name} » modifié`,
      entityType: "property",
      entityId: propertyId,
      metadata: { before: { name: before.name, address: before.address, district: before.district, ownerId: before.ownerId } },
      ip: ctx.ip,
    });
  });
}

export async function listProperties(ctx: Scope, f: { ownerId?: string } = {}) {
  return db
    .select({
      property: properties,
      ownerName: owners.fullName,
      unitCount: sql<number>`(select count(*)::int from ${units} u where u.property_id = ${properties.id} and u.archived_at is null)`,
      occupiedCount: sql<number>`(select count(*)::int from ${units} u where u.property_id = ${properties.id} and u.archived_at is null and u.status = 'OCCUPIED')`,
    })
    .from(properties)
    .innerJoin(owners, eq(owners.id, properties.ownerId))
    .where(and(propertyScope(ctx), isNull(properties.archivedAt), f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined))
    .orderBy(asc(properties.name));
}

export async function getProperty(ctx: Scope, propertyId: string) {
  const property = await getScopedProperty(ctx, propertyId);
  const [owner] = await db.select().from(owners).where(eq(owners.id, property.ownerId)).limit(1);
  const unitRows = await db
    .select({ unit: units, lease: leases, tenantName: tenants.fullName, tenantId: tenants.id })
    .from(units)
    .leftJoin(leases, and(eq(leases.unitId, units.id), eq(leases.status, "ACTIVE")))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(units.propertyId, propertyId), isNull(units.archivedAt)))
    .orderBy(asc(units.label));
  return { property, owner, units: unitRows };
}

/* ─────────── Logements ─────────── */

export const unitSchema = z.object({
  propertyId: uuid,
  label: reqText("Numéro du logement", 40),
  type: z.enum(["CHAMBRE", "STUDIO", "APPARTEMENT", "MAISON", "BOUTIQUE", "BUREAU", "AUTRE"], { message: "Type de logement invalide" }),
  rentAmount: amount("Loyer", { min: 1 }),
  periodicity: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"]).default("MONTHLY"),
  dueDay: z.coerce.number({ message: "Jour d'échéance invalide" }).int().min(1, "Jour d'échéance : entre 1 et 31").max(31, "Jour d'échéance : entre 1 et 31"),
  depositAmount: amount("Caution").default(0),
  description: optText(500),
});

export async function createUnit(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "property.write");
  const input = unitSchema.parse(raw);
  const property = await getScopedProperty(ctx, input.propertyId);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: units.id }).from(units).where(and(eq(units.propertyId, property.id), eq(units.label, input.label))).limit(1);
    if (dup) throw new BusinessError(`Le logement ${input.label} existe déjà dans ce bien.`);
    const [u] = await tx.insert(units).values({ ...input, organizationId: ctx.orgId }).returning();
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "unit.create",
      summary: `Logement ${u.label} ajouté à « ${property.name} » (loyer ${formatMoney(u.rentAmount)})`,
      entityType: "unit",
      entityId: u.id,
      ip: ctx.ip,
    });
    return u;
  });
}

export async function updateUnit(ctx: StaffCtx, unitId: string, raw: unknown) {
  assertCan(ctx.permissions, "property.write");
  const { unit } = await getScopedUnit(ctx, unitId);
  const input = unitSchema.parse({ ...(raw as object), propertyId: unit.propertyId });
  await db.transaction(async (tx) => {
    await tx
      .update(units)
      .set({ label: input.label, type: input.type, rentAmount: input.rentAmount, periodicity: input.periodicity, dueDay: input.dueDay, depositAmount: input.depositAmount, description: input.description })
      .where(eq(units.id, unitId));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "unit.update",
      summary: `Logement ${input.label} modifié`,
      entityType: "unit",
      entityId: unitId,
      metadata: { before: { label: unit.label, rentAmount: unit.rentAmount, dueDay: unit.dueDay, type: unit.type } },
      ip: ctx.ip,
    });
  });
}

/** Vacant ⇄ Réservé (Occupé est géré par les locations) */
export async function setUnitReserved(ctx: StaffCtx, unitId: string, reserved: boolean) {
  assertCan(ctx.permissions, "property.write");
  const { unit } = await getScopedUnit(ctx, unitId);
  if (unit.status === "OCCUPIED") throw new BusinessError("Ce logement est occupé.");
  await db.transaction(async (tx) => {
    await tx.update(units).set({ status: reserved ? "RESERVED" : "VACANT" }).where(eq(units.id, unitId));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "unit.status",
      summary: `Logement ${unit.label} marqué ${reserved ? "réservé" : "vacant"}`,
      entityType: "unit",
      entityId: unitId,
      ip: ctx.ip,
    });
  });
}

export async function listUnits(ctx: Scope, f: { status?: "VACANT" | "OCCUPIED" | "RESERVED"; propertyId?: string; ownerId?: string } = {}) {
  return db
    .select({ unit: units, propertyName: properties.name, propertyId: properties.id, district: properties.district })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(
        propertyScope(ctx),
        isNull(units.archivedAt),
        f.status ? eq(units.status, f.status) : undefined,
        f.propertyId ? eq(properties.id, f.propertyId) : undefined,
        f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined,
      ),
    )
    .orderBy(asc(properties.name), asc(units.label));
}

export async function unitCounts(ctx: Scope, f: { ownerId?: string; propertyId?: string } = {}) {
  const rows = await db
    .select({ status: units.status, n: count() })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(propertyScope(ctx), isNull(units.archivedAt), isNull(properties.archivedAt), f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined, f.propertyId ? eq(properties.id, f.propertyId) : undefined),
    )
    .groupBy(units.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  return { total: rows.reduce((s, r) => s + r.n, 0), occupied: by.OCCUPIED ?? 0, vacant: by.VACANT ?? 0, reserved: by.RESERVED ?? 0 };
}
