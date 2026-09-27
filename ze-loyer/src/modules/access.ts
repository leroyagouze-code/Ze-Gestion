/*
 * Périmètre des données (vérifié côté serveur, jamais seulement dans l'interface).
 *   - Organisation : toute requête est filtrée par organization_id.
 *   - Rôle OWNER (propriétaire suivi par une agence) : uniquement les biens de sa fiche propriétaire.
 *   - Locataire : uniquement les baux dont il est le titulaire (tenants.user_id).
 */
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { leases, properties, tenants, units } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import type { StaffCtx } from "./auth/context";

export type Scope = Pick<StaffCtx, "orgId" | "ownerId">;

/** Condition sur la table properties */
export function propertyScope(ctx: Scope): SQL {
  return and(eq(properties.organizationId, ctx.orgId), ctx.ownerId ? eq(properties.ownerId, ctx.ownerId) : undefined)!;
}

export async function getScopedProperty(ctx: Scope, propertyId: string, tx: DbOrTx = db) {
  const [p] = await tx.select().from(properties).where(and(eq(properties.id, propertyId), propertyScope(ctx))).limit(1);
  if (!p) throw new NotFoundError("Bien");
  return p;
}

export async function getScopedUnit(ctx: Scope, unitId: string, tx: DbOrTx = db) {
  const [r] = await tx
    .select({ unit: units, property: properties })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(units.id, unitId), propertyScope(ctx)))
    .limit(1);
  if (!r) throw new NotFoundError("Logement");
  return r;
}

export async function getScopedLease(ctx: Scope, leaseId: string, tx: DbOrTx = db) {
  const [r] = await tx
    .select({ lease: leases, unit: units, property: properties, tenant: tenants })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.id, leaseId), propertyScope(ctx)))
    .limit(1);
  if (!r) throw new NotFoundError("Location");
  return r;
}

/** Locataires visibles : ceux de l'organisation ; pour un propriétaire, ceux ayant (eu) un bail sur ses biens. */
export async function scopedTenantIds(ctx: Scope, tx: DbOrTx = db): Promise<string[] | null> {
  if (!ctx.ownerId) return null; // null = pas de restriction supplémentaire (filtre organisation seul)
  const rows = await tx
    .selectDistinct({ id: leases.tenantId })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(propertyScope(ctx));
  return rows.map((r) => r.id);
}

export async function getScopedTenant(ctx: Scope, tenantId: string, tx: DbOrTx = db) {
  const [t] = await tx.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.organizationId, ctx.orgId))).limit(1);
  if (!t) throw new NotFoundError("Locataire");
  const allowed = await scopedTenantIds(ctx, tx);
  if (allowed && !allowed.includes(t.id)) throw new NotFoundError("Locataire");
  return t;
}

export function tenantScope(ctx: Scope, allowed: string[] | null): SQL {
  return and(eq(tenants.organizationId, ctx.orgId), allowed ? inArray(tenants.id, allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]) : undefined)!;
}

/* ─────────── Espace locataire ─────────── */

/** Baux du locataire connecté (tous organismes confondus), du plus récent au plus ancien. */
export async function tenantLeases(userId: string, tx: DbOrTx = db) {
  const rows = await tx
    .select({ lease: leases, unit: units, property: properties, tenant: tenants })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(tenants.userId, userId));
  return rows.sort((a, b) => (a.lease.status === b.lease.status ? (a.lease.startDate < b.lease.startDate ? 1 : -1) : a.lease.status === "ACTIVE" ? -1 : 1));
}

export async function getTenantLease(userId: string, leaseId: string | undefined, tx: DbOrTx = db) {
  const all = await tenantLeases(userId, tx);
  const found = leaseId ? all.find((r) => r.lease.id === leaseId) : all[0];
  if (leaseId && !found) throw new NotFoundError("Location");
  return { current: found ?? null, all };
}
