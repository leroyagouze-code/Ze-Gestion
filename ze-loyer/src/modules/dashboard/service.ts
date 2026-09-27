import { and, count, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { leases, owners, payments, properties, tenants, units } from "@/db/schema";
import { propertyScope, type Scope } from "../access";
import { addDays, addMonths, daysBetween, endOfMonth, todayISO, type ISODate } from "../finance/dates";
import type { Situation } from "../finance/ledger";
import { syncAndLoad } from "../finance/service";
import { unitCounts } from "../properties/service";

export type Filters = { ownerId?: string; propertyId?: string; month?: string };

type Row = {
  leaseId: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  tenantUserId: string | null;
  unitLabel: string;
  propertyName: string;
  propertyId: string;
  ownerId: string;
  leaseStatus: "ACTIVE" | "ENDED";
  rentAmount: number;
  situation: Situation;
};

/** Toutes les locations visibles avec leur situation calculée. */
export async function scopedLedgerRows(ctx: Scope, f: Filters = {}, today = todayISO()): Promise<Row[]> {
  const rows = await db
    .select({
      leaseId: leases.id,
      leaseStatus: leases.status,
      rentAmount: leases.rentAmount,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      tenantUserId: tenants.userId,
      unitLabel: units.label,
      propertyName: properties.name,
      propertyId: properties.id,
      ownerId: properties.ownerId,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(propertyScope(ctx), f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined, f.propertyId ? eq(properties.id, f.propertyId) : undefined));
  const ledgers = await syncAndLoad(ctx, today, { leaseIds: rows.map((r) => r.leaseId) });
  return rows.map((r) => ({ ...r, situation: ledgers.get(r.leaseId)! }));
}

export function monthRange(month: string | undefined, today: ISODate) {
  const start = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : `${today.slice(0, 7)}-01`;
  return { start, end: endOfMonth(start), key: start.slice(0, 7) };
}

/** Loyers attendus / encaissés / à récupérer pour les échéances d'un mois. */
export function revenueForMonth(rows: Row[], start: ISODate, end: ISODate) {
  let expected = 0;
  let collected = 0;
  for (const r of rows)
    for (const l of r.situation.lines) {
      if (l.kind !== "CHARGE" || l.dueDate < start || l.dueDate > end) continue;
      expected += l.amount;
      collected += l.paid;
    }
  return { expected, collected, toRecover: expected - collected };
}

export function arrearsOf(rows: Row[]) {
  return rows
    .filter((r) => r.situation.overdueAmount > 0)
    .map((r) => ({ ...r, debt: r.situation.overdueAmount, daysLate: r.situation.daysLate }))
    .sort((a, b) => b.daysLate - a.daysLate || b.debt - a.debt);
}

/** Échéances non réglées dans les `days` prochains jours */
export function upcomingOf(rows: Row[], today: ISODate, days = 7) {
  const limit = addDays(today, days);
  return rows
    .filter((r) => r.leaseStatus === "ACTIVE" && r.situation.overdueAmount === 0 && r.situation.nextDue && r.situation.nextDue.date >= today && r.situation.nextDue.date <= limit)
    .map((r) => ({ ...r, dueDate: r.situation.nextDue!.date, amount: r.situation.nextDue!.amount, inDays: daysBetween(today, r.situation.nextDue!.date) }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export async function staffOverview(ctx: Scope, f: Filters = {}, today = todayISO()) {
  const rows = await scopedLedgerRows(ctx, f, today);
  const active = rows.filter((r) => r.leaseStatus === "ACTIVE");
  const { start, end, key } = monthRange(f.month, today);
  const [units, [propCount], [ownerCount]] = await Promise.all([
    unitCounts(ctx, f),
    db
      .select({ n: count() })
      .from(properties)
      .where(and(propertyScope(ctx), isNull(properties.archivedAt), f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined, f.propertyId ? eq(properties.id, f.propertyId) : undefined)),
    db.select({ n: count() }).from(owners).where(and(eq(owners.organizationId, ctx.orgId), ctx.ownerId ? eq(owners.id, ctx.ownerId) : undefined)),
  ]);
  const arrears = arrearsOf(rows);
  const upcoming = upcomingOf(active, today);
  return {
    month: key,
    units,
    properties: propCount.n,
    owners: ownerCount.n,
    revenue: revenueForMonth(rows, start, end),
    cashIn: await cashIn(ctx, start, end, f),
    arrears,
    arrearsTotal: arrears.reduce((s, a) => s + a.debt, 0),
    upcoming,
    tenantsAhead: active.filter((r) => r.situation.status === "EN_AVANCE").length,
  };
}

/** Argent réellement reçu sur la période, par type et par mode. */
export async function cashIn(ctx: Scope, start: ISODate, end: ISODate, f: Filters = {}) {
  const rows = await db
    .select({ type: payments.type, method: payments.method, amount: payments.amount })
    .from(payments)
    .innerJoin(leases, eq(leases.id, payments.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(
        propertyScope(ctx),
        eq(payments.status, "VALID"),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end),
        inArray(payments.type, ["LOYER", "AVANCE", "CAUTION", "CHARGE", "FRAIS", "AUTRE"]),
        f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined,
        f.propertyId ? eq(properties.id, f.propertyId) : undefined,
      ),
    );
  const byType: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  let rent = 0;
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + r.amount;
    byMethod[r.method] = (byMethod[r.method] ?? 0) + r.amount;
    if (r.type === "LOYER" || r.type === "AVANCE") rent += r.amount;
  }
  return { total: rows.reduce((s, r) => s + r.amount, 0), rent, byType, byMethod };
}

/** Rapport : 6 derniers mois + détail par bien pour le mois choisi. */
export async function report(ctx: Scope, f: Filters = {}, today = todayISO()) {
  const rows = await scopedLedgerRows(ctx, f, today);
  const { start, end, key } = monthRange(f.month, today);
  const months = Array.from({ length: 6 }, (_, i) => {
    const s = addMonths(start, i - 5);
    return { key: s.slice(0, 7), ...revenueForMonth(rows, s, endOfMonth(s)) };
  });
  const byProperty = new Map<string, { name: string; expected: number; collected: number; toRecover: number; arrears: number }>();
  for (const r of rows) {
    const cur = byProperty.get(r.propertyId) ?? { name: r.propertyName, expected: 0, collected: 0, toRecover: 0, arrears: 0 };
    const rev = revenueForMonth([r], start, end);
    cur.expected += rev.expected;
    cur.collected += rev.collected;
    cur.toRecover += rev.toRecover;
    cur.arrears += r.situation.overdueAmount;
    byProperty.set(r.propertyId, cur);
  }
  return {
    month: key,
    months,
    current: revenueForMonth(rows, start, end),
    cashIn: await cashIn(ctx, start, end, f),
    byProperty: [...byProperty.values()].sort((a, b) => a.name.localeCompare(b.name)),
    arrearsTotal: rows.reduce((s, r) => s + r.situation.overdueAmount, 0),
    advanceTotal: rows.reduce((s, r) => s + r.situation.advance, 0),
  };
}

/** Options des filtres (propriétaires, biens) visibles */
export async function filterOptions(ctx: Scope) {
  const [ownerRows, propRows] = await Promise.all([
    db.select({ id: owners.id, name: owners.fullName }).from(owners).where(and(eq(owners.organizationId, ctx.orgId), ctx.ownerId ? eq(owners.id, ctx.ownerId) : undefined)),
    db.select({ id: properties.id, name: properties.name, ownerId: properties.ownerId }).from(properties).where(and(propertyScope(ctx), isNull(properties.archivedAt))),
  ]);
  return {
    owners: ownerRows.sort((a, b) => a.name.localeCompare(b.name)),
    properties: propRows.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
