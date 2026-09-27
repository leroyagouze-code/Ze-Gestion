import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import {
  deposits,
  leases,
  organizations,
  owners,
  paymentAllocations,
  payments,
  properties,
  receipts,
  receiptSequences,
  rentCharges,
  tenants,
  units,
  users,
  type ReceiptSnapshot,
} from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { assertCan } from "@/lib/permissions";
import { amount, isoDate, optText, uuid } from "@/lib/zod";
import { getScopedLease, propertyScope, type Scope } from "../access";
import type { StaffCtx } from "../auth/context";
import { audit } from "../audit/service";
import { notify } from "../notifications/service";
import { capitalize, monthLabel, todayISO, type ISODate } from "./dates";
import { METHOD_LABELS, TYPE_LABELS } from "./labels";
import {
  computeLedger,
  linesForPayment,
  persistedAllocations,
  scheduleUntil,
  type LeaseTerms,
  type Situation,
  type TransactionType,
} from "./ledger";

type LeaseRow = typeof leases.$inferSelect;

export function termsOf(l: Pick<LeaseRow, "startDate" | "endDate" | "rentAmount" | "periodicity" | "dueDay">): LeaseTerms {
  return { startDate: l.startDate, endDate: l.endDate, rentAmount: l.rentAmount, periodicity: l.periodicity, dueDay: l.dueDay };
}

/* ─────────── Loyers appelés ─────────── */

/**
 * Matérialise les loyers de chaque période commencée (jusqu'à aujourd'hui). Idempotent.
 * Renvoie les baux pour lesquels de nouveaux loyers ont été créés.
 */
export async function ensureCharges(tx: DbOrTx, leaseRows: LeaseRow[], today = todayISO()) {
  if (!leaseRows.length) return new Set<string>();
  const existing = await tx
    .select({ leaseId: rentCharges.leaseId, periodStart: rentCharges.periodStart })
    .from(rentCharges)
    .where(inArray(rentCharges.leaseId, leaseRows.map((l) => l.id)));
  const have = new Set(existing.map((e) => `${e.leaseId}|${e.periodStart}`));
  const toInsert: (typeof rentCharges.$inferInsert)[] = [];
  for (const l of leaseRows) {
    for (const p of scheduleUntil(termsOf(l), today)) {
      if (have.has(`${l.id}|${p.periodStart}`)) continue;
      toInsert.push({ organizationId: l.organizationId, leaseId: l.id, periodStart: p.periodStart, periodEnd: p.periodEnd, dueDate: p.dueDate, amount: p.amount });
    }
  }
  const changed = new Set<string>();
  for (let i = 0; i < toInsert.length; i += 500) {
    const rows = await tx.insert(rentCharges).values(toInsert.slice(i, i + 500)).onConflictDoNothing().returning({ leaseId: rentCharges.leaseId });
    rows.forEach((r) => changed.add(r.leaseId));
  }
  return changed;
}

/** Calcule la situation de plusieurs baux en 2 requêtes. */
export async function loadLedgers(tx: DbOrTx, leaseRows: LeaseRow[], today = todayISO()) {
  const out = new Map<string, Situation>();
  if (!leaseRows.length) return out;
  const ids = leaseRows.map((l) => l.id);
  const [charges, txs] = await Promise.all([
    tx.select().from(rentCharges).where(inArray(rentCharges.leaseId, ids)).orderBy(asc(rentCharges.periodStart)),
    tx
      .select({ id: payments.id, leaseId: payments.leaseId, type: payments.type, amount: payments.amount, date: payments.paidAt, createdAt: payments.createdAt })
      .from(payments)
      .where(and(inArray(payments.leaseId, ids), eq(payments.status, "VALID"))),
  ]);
  for (const l of leaseRows) {
    out.set(
      l.id,
      computeLedger({
        terms: termsOf(l),
        charges: charges.filter((c) => c.leaseId === l.id),
        transactions: txs.filter((t) => t.leaseId === l.id).map((t) => ({ ...t, createdAt: t.createdAt.getTime() })),
        today,
      }),
    );
  }
  return out;
}

/** Recalcule et enregistre la répartition des paiements d'un bail (règle FIFO). */
export async function reallocate(tx: DbOrTx, lease: LeaseRow, today = todayISO()) {
  const situation = (await loadLedgers(tx, [lease], today)).get(lease.id)!;
  const chargeIds = (await tx.select({ id: rentCharges.id }).from(rentCharges).where(eq(rentCharges.leaseId, lease.id))).map((c) => c.id);
  if (chargeIds.length) await tx.delete(paymentAllocations).where(inArray(paymentAllocations.chargeId, chargeIds));
  const rows = persistedAllocations(situation);
  if (rows.length) await tx.insert(paymentAllocations).values(rows);
  return situation;
}

/** Met à jour les loyers appelés de toutes les locations visibles, puis renvoie leurs situations. */
export async function syncAndLoad(ctx: Scope, today = todayISO(), filter?: { leaseIds?: string[] }) {
  const rows = await db
    .select({ lease: leases })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(propertyScope(ctx), filter?.leaseIds ? inArray(leases.id, filter.leaseIds.length ? filter.leaseIds : [NIL]) : undefined));
  const list = rows.map((r) => r.lease);
  await syncLeases(list, today);
  return loadLedgers(db, list, today);
}

const NIL = "00000000-0000-0000-0000-000000000000";

export async function syncLeases(list: LeaseRow[], today = todayISO()) {
  const active = list.filter((l) => l.status === "ACTIVE" || l.endDate);
  if (!active.length) return;
  await db.transaction(async (tx) => {
    const changed = await ensureCharges(tx, active, today);
    for (const l of active) if (changed.has(l.id)) await reallocate(tx, l, today);
  });
}

/* ─────────── Paiements ─────────── */

export const paymentSchema = z
  .object({
    leaseId: uuid,
    type: z.enum(["LOYER", "AVANCE", "CAUTION", "CHARGE", "FRAIS", "REMBOURSEMENT", "AJUSTEMENT", "AUTRE"], { message: "Type de paiement invalide" }),
    amount: amount("Montant", { allowNegative: true }),
    method: z.enum(["CASH", "TMONEY", "FLOOZ", "BANK", "OTHER"], { message: "Choisissez un mode de paiement" }),
    paidAt: isoDate("Date du paiement"),
    reference: optText(100),
    note: optText(500),
  })
  .refine((v) => v.amount !== 0, { message: "Le montant ne peut pas être 0", path: ["amount"] })
  .refine((v) => v.type === "AJUSTEMENT" || v.amount > 0, { message: "Le montant doit être positif", path: ["amount"] })
  .refine((v) => v.type !== "AJUSTEMENT" || !!v.note, { message: "Expliquez la raison de l'ajustement", path: ["note"] });

export type PaymentInput = z.input<typeof paymentSchema>;

const RECEIPT_TYPES: TransactionType[] = ["LOYER", "AVANCE", "CAUTION", "CHARGE", "FRAIS", "AUTRE"];

export async function recordPayment(ctx: StaffCtx, raw: unknown, today = todayISO()) {
  assertCan(ctx.permissions, "payment.write");
  const input = paymentSchema.parse(raw);
  if (input.paidAt > today) throw new BusinessError("La date du paiement ne peut pas être dans le futur.");
  if (input.type === "AJUSTEMENT" || input.type === "REMBOURSEMENT") assertCan(ctx.permissions, "payment.cancel");

  return db.transaction(async (tx) => {
    const { lease, tenant, unit, property } = await getScopedLease(ctx, input.leaseId, tx);
    if (input.paidAt < lease.startDate && input.type !== "CAUTION" && input.type !== "AVANCE")
      throw new BusinessError("La date du paiement est antérieure au début de la location.");

    const [p] = await tx
      .insert(payments)
      .values({
        organizationId: ctx.orgId,
        leaseId: lease.id,
        type: input.type,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt,
        reference: input.reference,
        note: input.note,
        recordedBy: ctx.userId,
      })
      .returning();

    if (input.type === "CAUTION")
      await tx.insert(deposits).values({ organizationId: ctx.orgId, leaseId: lease.id, paymentId: p.id, amount: input.amount, depositedAt: input.paidAt });

    await ensureCharges(tx, [lease], today);
    const situation = await reallocate(tx, lease, today);

    let receiptId: string | null = null;
    if (RECEIPT_TYPES.includes(input.type)) {
      receiptId = await issueReceipt(tx, { ctx, payment: p, lease, tenant, unit, property, situation });
    }

    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "payment.create",
      summary: `${TYPE_LABELS[input.type]} de ${formatMoney(input.amount)} enregistré pour ${tenant.fullName} (${unit.label}) — ${METHOD_LABELS[input.method]}`,
      entityType: "payment",
      entityId: p.id,
      metadata: { leaseId: lease.id, type: input.type, amount: input.amount, method: input.method, paidAt: input.paidAt },
      ip: ctx.ip,
    });

    if (tenant.userId)
      await notify(tx, {
        userId: tenant.userId,
        organizationId: ctx.orgId,
        title: "Paiement enregistré",
        body: `${TYPE_LABELS[input.type]} de ${formatMoney(input.amount)} enregistré le ${input.paidAt.split("-").reverse().join("/")}.`,
        link: receiptId ? "/mon-espace/quittances" : "/mon-espace/carnet",
      });

    return { paymentId: p.id, receiptId, situation };
  });
}

export async function cancelPayment(ctx: StaffCtx, paymentId: string, reason: string, today = todayISO()) {
  assertCan(ctx.permissions, "payment.cancel");
  const why = reason.trim();
  if (why.length < 3) throw new BusinessError("Indiquez la raison de l'annulation.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.organizationId, ctx.orgId))).for("update").limit(1);
    if (!p) throw new NotFoundError("Paiement");
    const { lease, tenant } = await getScopedLease(ctx, p.leaseId, tx);
    if (p.status === "CANCELLED") throw new BusinessError("Ce paiement est déjà annulé.");
    if (p.type === "CAUTION") {
      const [d] = await tx.select().from(deposits).where(eq(deposits.paymentId, p.id)).limit(1);
      if (d && d.status !== "DEPOSITED") throw new BusinessError("Cette caution a déjà été remboursée ou retenue : annulation impossible.");
    }
    await tx.update(payments).set({ status: "CANCELLED", cancelReason: why.slice(0, 500), cancelledAt: new Date(), cancelledBy: ctx.userId }).where(eq(payments.id, p.id));
    await reallocate(tx, lease, today);
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "payment.cancel",
      summary: `Paiement de ${formatMoney(p.amount)} de ${tenant.fullName} annulé — raison : ${why}`,
      entityType: "payment",
      entityId: p.id,
      metadata: { reason: why, previous: { amount: p.amount, type: p.type, paidAt: p.paidAt } },
      ip: ctx.ip,
    });
  });
}

/* ─────────── Quittances ─────────── */

async function nextReceiptNumber(tx: DbOrTx, orgId: string, year: number) {
  const [r] = await tx
    .insert(receiptSequences)
    .values({ organizationId: orgId, year, last: 1 })
    .onConflictDoUpdate({ target: [receiptSequences.organizationId, receiptSequences.year], set: { last: sql`${receiptSequences.last} + 1` } })
    .returning({ last: receiptSequences.last });
  return `ZL-${year}-${String(r.last).padStart(6, "0")}`;
}

function periodLabelOf(lines: { periodStart: ISODate }[]) {
  if (!lines.length) return "—";
  const first = capitalize(monthLabel(lines[0].periodStart));
  if (lines.length === 1) return first;
  return `${first} → ${capitalize(monthLabel(lines[lines.length - 1].periodStart))}`;
}

async function issueReceipt(
  tx: DbOrTx,
  a: {
    ctx: StaffCtx;
    payment: typeof payments.$inferSelect;
    lease: LeaseRow;
    tenant: typeof tenants.$inferSelect;
    unit: typeof units.$inferSelect;
    property: typeof properties.$inferSelect;
    situation: Situation;
  },
) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, a.ctx.orgId)).limit(1);
  const [owner] = await tx.select({ fullName: owners.fullName }).from(owners).where(eq(owners.id, a.property.ownerId)).limit(1);
  const isRent = a.payment.type === "LOYER" || a.payment.type === "AVANCE";
  const covered = isRent ? linesForPayment(a.situation, a.payment.id) : [];
  const lines = isRent
    ? covered.map((l) => ({ label: capitalize(monthLabel(l.periodStart)), amount: l.amount, full: l.full }))
    : [{ label: TYPE_LABELS[a.payment.type], amount: a.payment.amount, full: true }];
  const status: ReceiptSnapshot["status"] = lines.every((l) => l.full) ? "PAYÉ" : "PARTIEL";
  const snapshot: ReceiptSnapshot = {
    organizationName: org.name,
    organizationPhone: org.phone,
    tenantName: a.tenant.fullName,
    tenantPhone: a.tenant.phone,
    unitLabel: a.unit.label,
    propertyName: a.property.name,
    propertyAddress: [a.property.address, a.property.district, a.property.city].filter(Boolean).join(", ") || null,
    ownerName: owner?.fullName ?? "",
    type: a.payment.type,
    method: a.payment.method,
    paidAt: a.payment.paidAt,
    reference: a.payment.reference,
    status,
    lines,
    remainingAfter: Math.max(0, a.situation.amountDue),
  };
  const number = await nextReceiptNumber(tx, a.ctx.orgId, Number(a.payment.paidAt.slice(0, 4)));
  const [r] = await tx
    .insert(receipts)
    .values({
      organizationId: a.ctx.orgId,
      paymentId: a.payment.id,
      leaseId: a.lease.id,
      number,
      periodLabel: isRent ? periodLabelOf(covered) : TYPE_LABELS[a.payment.type],
      amount: a.payment.amount,
      snapshot,
    })
    .returning({ id: receipts.id });
  return r.id;
}

/** Quittance visible par le personnel (périmètre) ou par le locataire titulaire. */
export async function getReceipt(viewer: { kind: "staff"; ctx: Scope } | { kind: "tenant"; userId: string }, receiptId: string) {
  const [r] = await db
    .select({ receipt: receipts, paymentStatus: payments.status, tenantUserId: tenants.userId, ownerId: properties.ownerId, orgId: receipts.organizationId })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .innerJoin(leases, eq(leases.id, receipts.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(receipts.id, receiptId))
    .limit(1);
  if (!r) throw new NotFoundError("Quittance");
  const allowed =
    viewer.kind === "tenant"
      ? r.tenantUserId === viewer.userId
      : r.orgId === viewer.ctx.orgId && (!viewer.ctx.ownerId || viewer.ctx.ownerId === r.ownerId);
  if (!allowed) throw new NotFoundError("Quittance");
  return { ...r.receipt, cancelled: r.paymentStatus === "CANCELLED" };
}

export async function listReceiptsForLease(leaseId: string) {
  return db
    .select({ id: receipts.id, number: receipts.number, periodLabel: receipts.periodLabel, amount: receipts.amount, issuedAt: receipts.issuedAt, paymentStatus: payments.status, type: payments.type, paidAt: payments.paidAt })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .where(eq(receipts.leaseId, leaseId))
    .orderBy(desc(payments.paidAt), desc(receipts.issuedAt));
}

/* ─────────── Liste et détail des paiements ─────────── */

export async function listPayments(
  ctx: Scope,
  f: { from?: ISODate; to?: ISODate; ownerId?: string; propertyId?: string; type?: TransactionType; q?: string; leaseId?: string; limit?: number; offset?: number } = {},
) {
  const where = and(
    propertyScope(ctx),
    f.from ? gte(payments.paidAt, f.from) : undefined,
    f.to ? lte(payments.paidAt, f.to) : undefined,
    f.ownerId ? eq(properties.ownerId, f.ownerId) : undefined,
    f.propertyId ? eq(properties.id, f.propertyId) : undefined,
    f.type ? eq(payments.type, f.type) : undefined,
    f.leaseId ? eq(payments.leaseId, f.leaseId) : undefined,
    f.q ? sql`(${tenants.fullName} ilike ${"%" + f.q + "%"} or ${units.label} ilike ${"%" + f.q + "%"})` : undefined,
  );
  return db
    .select({
      payment: payments,
      tenantName: tenants.fullName,
      unitLabel: units.label,
      propertyName: properties.name,
      receiptId: receipts.id,
      receiptNumber: receipts.number,
      recordedByName: users.fullName,
    })
    .from(payments)
    .innerJoin(leases, eq(leases.id, payments.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .leftJoin(receipts, eq(receipts.paymentId, payments.id))
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(where)
    .orderBy(desc(payments.paidAt), desc(payments.createdAt))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
}

export async function getPayment(ctx: Scope, paymentId: string) {
  const [row] = await db
    .select({ payment: payments, receiptId: receipts.id, receiptNumber: receipts.number, recordedByName: users.fullName })
    .from(payments)
    .leftJoin(receipts, eq(receipts.paymentId, payments.id))
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(and(eq(payments.id, paymentId), eq(payments.organizationId, ctx.orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Paiement");
  const scoped = await getScopedLease(ctx, row.payment.leaseId);
  const allocations = await db
    .select({ amount: paymentAllocations.amount, periodStart: rentCharges.periodStart, chargeAmount: rentCharges.amount })
    .from(paymentAllocations)
    .innerJoin(rentCharges, eq(rentCharges.id, paymentAllocations.chargeId))
    .where(eq(paymentAllocations.paymentId, paymentId))
    .orderBy(asc(rentCharges.periodStart));
  return { ...row, ...scoped, allocations };
}

/* ─────────── Cautions ─────────── */

export async function listDeposits(leaseId: string) {
  return db
    .select({ deposit: deposits, paymentStatus: payments.status })
    .from(deposits)
    .leftJoin(payments, eq(payments.id, deposits.paymentId))
    .where(eq(deposits.leaseId, leaseId))
    .orderBy(desc(deposits.depositedAt))
    .then((rows) => rows.filter((r) => r.paymentStatus !== "CANCELLED").map((r) => r.deposit));
}

export const closeDepositSchema = z.object({
  depositId: uuid,
  refundedAmount: amount("Montant remboursé"),
  retainedAmount: amount("Montant retenu"),
  closedAt: isoDate("Date"),
  comment: optText(500),
});

export async function closeDeposit(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "deposit.write");
  const input = closeDepositSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(deposits).where(and(eq(deposits.id, input.depositId), eq(deposits.organizationId, ctx.orgId))).for("update").limit(1);
    if (!d) throw new NotFoundError("Caution");
    const { tenant } = await getScopedLease(ctx, d.leaseId, tx);
    if (d.status !== "DEPOSITED") throw new BusinessError("Cette caution est déjà clôturée.");
    if (input.refundedAmount + input.retainedAmount !== d.amount)
      throw new BusinessError(`Remboursé + retenu doit être égal à la caution (${formatMoney(d.amount)}).`);
    if (input.retainedAmount > 0 && !input.comment) throw new BusinessError("Expliquez la raison de la retenue.");
    const status = input.retainedAmount === 0 ? "REFUNDED" : input.refundedAmount === 0 ? "RETAINED" : "PARTIALLY_REFUNDED";
    await tx
      .update(deposits)
      .set({ status, refundedAmount: input.refundedAmount, retainedAmount: input.retainedAmount, comment: input.comment, closedAt: input.closedAt })
      .where(eq(deposits.id, d.id));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "deposit.close",
      summary: `Caution de ${tenant.fullName} clôturée : ${formatMoney(input.refundedAmount)} remboursé, ${formatMoney(input.retainedAmount)} retenu`,
      entityType: "deposit",
      entityId: d.id,
      metadata: input,
      ip: ctx.ip,
    });
  });
}

