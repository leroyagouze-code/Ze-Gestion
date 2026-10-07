import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leases, owners, properties, tenants, units } from "@/db/schema";
import { BusinessError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { assertCan } from "@/lib/permissions";
import { amount, isoDate, optEmail, optText, phone, reqText, uuid } from "@/lib/zod";
import { getScopedLease, getScopedTenant, getScopedUnit, propertyScope, scopedTenantIds, tenantScope, type Scope } from "../access";
import type { StaffCtx } from "../auth/context";
import { audit } from "../audit/service";
import { todayISO } from "../finance/dates";
import { ensureCharges, reallocate, recordPayment, syncAndLoad } from "../finance/service";

export const tenantSchema = z.object({
  fullName: reqText("Nom du locataire", 120),
  phone,
  email: optEmail,
  idNumber: optText(60),
  notes: optText(1000),
});

const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

export const leaseSchema = z.object({
  unitId: uuid,
  startDate: isoDate("Date d'entrée"),
  rentAmount: z.preprocess(blank, amount("Loyer", { min: 1 }).optional()),
  dueDay: z.preprocess(blank, z.coerce.number({ message: "Jour d'échéance invalide" }).int().min(1, "Jour d'échéance : entre 1 et 31").max(31, "Jour d'échéance : entre 1 et 31").optional()),
  depositPaid: z.preprocess(blank, amount("Caution versée").optional()),
  depositMethod: z.preprocess(blank, z.enum(["CASH", "TMONEY", "FLOOZ", "BANK", "OTHER"]).optional()),
});

/** Ajoute un locataire et, si un logement est choisi, crée sa location dans la foulée. */
export async function createTenant(ctx: StaffCtx, raw: Record<string, unknown>) {
  assertCan(ctx.permissions, "tenant.write");
  const input = tenantSchema.parse(raw);
  const withLease = !!raw.unitId;
  const leaseInput = withLease ? leaseSchema.parse(raw) : null;

  const tenant = await db.transaction(async (tx) => {
    const [t] = await tx.insert(tenants).values({ ...input, organizationId: ctx.orgId }).returning();
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "tenant.create", summary: `Locataire ${t.fullName} ajouté`, entityType: "tenant", entityId: t.id, ip: ctx.ip });
    return t;
  });
  let leaseId: string | null = null;
  if (leaseInput) leaseId = (await createLease(ctx, { ...leaseInput, tenantId: tenant.id })).id;
  return { tenant, leaseId };
}

export async function updateTenant(ctx: StaffCtx, tenantId: string, raw: unknown) {
  assertCan(ctx.permissions, "tenant.write");
  const before = await getScopedTenant(ctx, tenantId);
  const input = tenantSchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx.update(tenants).set(input).where(eq(tenants.id, tenantId));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "tenant.update",
      summary: `Fiche de ${input.fullName} modifiée`,
      entityType: "tenant",
      entityId: tenantId,
      metadata: { before: { fullName: before.fullName, phone: before.phone, email: before.email } },
      ip: ctx.ip,
    });
  });
}

export async function createLease(ctx: StaffCtx, raw: z.input<typeof leaseSchema> & { tenantId: string }, today = todayISO()) {
  assertCan(ctx.permissions, "lease.write");
  const input = leaseSchema.parse(raw);
  const tenant = await getScopedTenant(ctx, raw.tenantId);
  const lease = await db.transaction(async (tx) => {
    const { unit, property } = await getScopedUnit(ctx, input.unitId, tx);
    const [busy] = await tx.select({ id: leases.id }).from(leases).where(and(eq(leases.unitId, unit.id), eq(leases.status, "ACTIVE"))).for("update").limit(1);
    if (busy) throw new BusinessError(`Le logement ${unit.label} est déjà occupé.`);
    const [l] = await tx
      .insert(leases)
      .values({
        organizationId: ctx.orgId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: input.startDate,
        rentAmount: input.rentAmount ?? unit.rentAmount,
        periodicity: unit.periodicity,
        dueDay: input.dueDay ?? unit.dueDay,
      })
      .returning();
    await tx.update(units).set({ status: "OCCUPIED" }).where(eq(units.id, unit.id));
    await ensureCharges(tx, [l], today);
    await reallocate(tx, l, today);
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "lease.create",
      summary: `${tenant.fullName} installé(e) dans ${unit.label} (${property.name}) à partir du ${input.startDate.split("-").reverse().join("/")} — loyer ${formatMoney(l.rentAmount)}`,
      entityType: "lease",
      entityId: l.id,
      ip: ctx.ip,
    });
    return l;
  });
  if (input.depositPaid && input.depositPaid > 0)
    await recordPayment(
      ctx,
      { leaseId: lease.id, type: "CAUTION", amount: input.depositPaid, method: input.depositMethod ?? "CASH", paidAt: input.startDate <= today ? input.startDate : today },
      today,
    );
  return lease;
}

export const endLeaseSchema = z.object({ leaseId: uuid, endDate: isoDate("Date de sortie") });

export async function endLease(ctx: StaffCtx, raw: unknown, today = todayISO()) {
  assertCan(ctx.permissions, "lease.write");
  const input = endLeaseSchema.parse(raw);
  await db.transaction(async (tx) => {
    const { lease, unit, tenant } = await getScopedLease(ctx, input.leaseId, tx);
    if (lease.status !== "ACTIVE") throw new BusinessError("Cette location est déjà terminée.");
    if (input.endDate < lease.startDate) throw new BusinessError("La date de sortie est avant la date d'entrée.");
    const [ended] = await tx.update(leases).set({ status: "ENDED", endDate: input.endDate }).where(eq(leases.id, lease.id)).returning();
    await tx.update(units).set({ status: "VACANT" }).where(eq(units.id, unit.id));
    await ensureCharges(tx, [ended], today < input.endDate ? today : input.endDate);
    await reallocate(tx, ended, today);
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "lease.end",
      summary: `Fin de location de ${tenant.fullName} (${unit.label}) au ${input.endDate.split("-").reverse().join("/")}`,
      entityType: "lease",
      entityId: lease.id,
      ip: ctx.ip,
    });
  });
}

/** Liste des locataires avec leur situation (à jour / en retard / en avance). */
export async function listTenantsWithSituation(ctx: Scope, f: { q?: string; status?: string; ownerId?: string; propertyId?: string } = {}) {
  const allowed = await scopedTenantIds(ctx);
  const rows = await db
    .select({ tenant: tenants, lease: leases, unitLabel: units.label, propertyName: properties.name, propertyId: properties.id, ownerId: properties.ownerId })
    .from(tenants)
    .leftJoin(leases, and(eq(leases.tenantId, tenants.id), eq(leases.status, "ACTIVE")))
    .leftJoin(units, eq(units.id, leases.unitId))
    .leftJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(
        tenantScope(ctx, allowed),
        f.q ? sql`(${tenants.fullName} ilike ${"%" + f.q + "%"} or ${tenants.phone} ilike ${"%" + f.q.replace(/\s/g, "") + "%"} or ${units.label} ilike ${"%" + f.q + "%"})` : undefined,
        f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined,
        f.propertyId ? eq(properties.id, f.propertyId) : undefined,
      ),
    )
    .orderBy(asc(tenants.fullName));
  // Un propriétaire ne voit pas les baux actifs d'autres propriétaires d'un même locataire
  const visible = rows.filter((r) => !ctx.ownerId || !r.lease || r.ownerId === ctx.ownerId);
  const leaseIds = visible.flatMap((r) => (r.lease ? [r.lease.id] : []));
  const ledgers = leaseIds.length ? await syncAndLoad(ctx, todayISO(), { leaseIds }) : new Map();
  const list = visible.map((r) => ({ ...r, situation: r.lease ? (ledgers.get(r.lease.id) ?? null) : null }));
  if (!f.status) return list;
  return list.filter((r) => (f.status === "SANS_LOGEMENT" ? !r.lease : r.situation?.status === f.status));
}

export async function getTenantDetail(ctx: Scope, tenantId: string) {
  const tenant = await getScopedTenant(ctx, tenantId);
  const leaseRows = await db
    .select({ lease: leases, unit: units, property: properties, ownerName: owners.fullName })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(owners, eq(owners.id, properties.ownerId))
    .where(and(eq(leases.tenantId, tenantId), propertyScope(ctx)))
    .orderBy(desc(leases.status), desc(leases.startDate));
  return { tenant, leases: leaseRows };
}

/* ─────────── Propriétaires (fiches) ─────────── */

export const ownerSchema = z.object({ fullName: reqText("Nom du propriétaire", 120), phone: phone.nullish(), email: optEmail });

export async function createOwner(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "owner.manage");
  const input = ownerSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [o] = await tx.insert(owners).values({ organizationId: ctx.orgId, fullName: input.fullName, phone: input.phone ?? null, email: input.email }).returning();
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "owner.create", summary: `Propriétaire ${o.fullName} ajouté`, entityType: "owner", entityId: o.id, ip: ctx.ip });
    return o;
  });
}

export async function listOwners(ctx: Scope) {
  return db
    .select({
      owner: owners,
      propertyCount: sql<number>`(select count(*)::int from ${properties} p where p.owner_id = ${owners.id} and p.archived_at is null)`,
      unitCount: sql<number>`(select count(*)::int from ${units} u join ${properties} p on p.id = u.property_id where p.owner_id = ${owners.id} and u.archived_at is null)`,
    })
    .from(owners)
    .where(and(eq(owners.organizationId, ctx.orgId), ctx.ownerId ? eq(owners.id, ctx.ownerId) : undefined))
    .orderBy(asc(owners.fullName));
}

