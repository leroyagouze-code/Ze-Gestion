import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { disputes, leases, payments, properties, tenants, units, users } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { assertCan } from "@/lib/permissions";
import { amount, optIsoDate, optUuid, reqText, uuid } from "@/lib/zod";
import { getTenantLease, propertyScope, type Scope } from "../access";
import type { StaffCtx, TenantCtx } from "../auth/context";
import { audit } from "../audit/service";
import { storeTenantProof } from "../documents/service";
import { notify } from "../notifications/service";
import { notifyStaff } from "../notifications/staff";

export const disputeSchema = z.object({
  leaseId: uuid,
  paymentId: optUuid,
  amount: z.preprocess((v) => (v === "" || v == null ? null : v), amount("Montant").nullable()),
  date: optIsoDate,
  comment: reqText("Commentaire", 1000),
});

/** Le locataire signale une erreur. Il ne modifie jamais l'historique lui-même. */
export async function createDispute(ctx: TenantCtx, raw: Record<string, unknown>, file: File | null) {
  const input = disputeSchema.parse(raw);
  const { current } = await getTenantLease(ctx.userId, input.leaseId);
  if (!current) throw new NotFoundError("Location");
  if (input.paymentId) {
    const [p] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.id, input.paymentId), eq(payments.leaseId, current.lease.id))).limit(1);
    if (!p) throw new NotFoundError("Paiement");
  }
  return db.transaction(async (tx) => {
    const proof = file && file.size > 0 ? await storeTenantProof(tx, { orgId: current.lease.organizationId, leaseId: current.lease.id, tenantId: current.tenant.id, userId: ctx.userId, file }) : null;
    const [d] = await tx
      .insert(disputes)
      .values({
        organizationId: current.lease.organizationId,
        leaseId: current.lease.id,
        paymentId: input.paymentId,
        amount: input.amount,
        date: input.date,
        comment: input.comment,
        proofDocumentId: proof?.id ?? null,
        createdBy: ctx.userId,
      })
      .returning();
    await audit(tx, {
      organizationId: current.lease.organizationId,
      userId: ctx.userId,
      action: "dispute.create",
      summary: `Contestation de ${current.tenant.fullName} (${current.unit.label})${input.amount ? ` sur ${formatMoney(input.amount)}` : ""}`,
      entityType: "dispute",
      entityId: d.id,
      ip: ctx.ip,
    });
    await notifyStaff(tx, current.lease.organizationId, "dispute.resolve", {
      title: "Nouvelle contestation",
      body: `${current.tenant.fullName} (${current.unit.label}) signale une erreur : « ${input.comment.slice(0, 120)} »`,
      link: `/contestations`,
    });
    return d;
  });
}

export async function listDisputes(ctx: Scope, status?: "OPEN" | "RESOLVED" | "REJECTED") {
  return db
    .select({ dispute: disputes, tenantName: tenants.fullName, tenantId: tenants.id, unitLabel: units.label, propertyName: properties.name, paymentAmount: payments.amount, paymentDate: payments.paidAt, resolvedByName: users.fullName })
    .from(disputes)
    .innerJoin(leases, eq(leases.id, disputes.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .leftJoin(payments, eq(payments.id, disputes.paymentId))
    .leftJoin(users, eq(users.id, disputes.resolvedBy))
    .where(and(propertyScope(ctx), status ? eq(disputes.status, status) : undefined))
    .orderBy(desc(disputes.createdAt));
}

export const resolveSchema = z.object({ disputeId: uuid, decision: z.enum(["RESOLVED", "REJECTED"]), response: reqText("Réponse", 1000) });

export async function resolveDispute(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "dispute.resolve");
  const input = resolveSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select({ dispute: disputes, tenantUserId: tenants.userId, tenantName: tenants.fullName })
      .from(disputes)
      .innerJoin(leases, eq(leases.id, disputes.leaseId))
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(disputes.id, input.disputeId), propertyScope(ctx)))
      .limit(1);
    if (!r) throw new NotFoundError("Contestation");
    if (r.dispute.status !== "OPEN") throw new BusinessError("Cette contestation est déjà traitée.");
    await tx.update(disputes).set({ status: input.decision, response: input.response, resolvedBy: ctx.userId, resolvedAt: new Date() }).where(eq(disputes.id, r.dispute.id));
    await audit(tx, {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: "dispute.resolve",
      summary: `Contestation de ${r.tenantName} ${input.decision === "RESOLVED" ? "acceptée" : "refusée"} : ${input.response}`,
      entityType: "dispute",
      entityId: r.dispute.id,
      ip: ctx.ip,
    });
    if (r.tenantUserId)
      await notify(tx, {
        userId: r.tenantUserId,
        organizationId: ctx.orgId,
        title: input.decision === "RESOLVED" ? "Votre signalement a été traité" : "Réponse à votre signalement",
        body: input.response,
        link: "/mon-espace/demandes",
      });
  });
}

export async function listTenantDisputes(leaseId: string) {
  return db
    .select({ dispute: disputes, paymentAmount: payments.amount, paymentDate: payments.paidAt })
    .from(disputes)
    .leftJoin(payments, eq(payments.id, disputes.paymentId))
    .where(eq(disputes.leaseId, leaseId))
    .orderBy(desc(disputes.createdAt));
}
