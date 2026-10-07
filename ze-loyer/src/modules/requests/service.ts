import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leases, properties, requests, tenants, units } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { optText, reqText, uuid } from "@/lib/zod";
import { getTenantLease, propertyScope, type Scope } from "../access";
import type { StaffCtx, TenantCtx } from "../auth/context";
import { audit } from "../audit/service";
import { notify } from "../notifications/service";
import { notifyStaff } from "../notifications/staff";

export const requestSchema = z.object({ leaseId: uuid, subject: reqText("Sujet", 120), message: reqText("Message", 2000) });

export async function createRequest(ctx: TenantCtx, raw: unknown) {
  const input = requestSchema.parse(raw);
  const { current } = await getTenantLease(ctx.userId, input.leaseId);
  if (!current) throw new NotFoundError("Location");
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(requests)
      .values({ organizationId: current.lease.organizationId, leaseId: current.lease.id, subject: input.subject, message: input.message, createdBy: ctx.userId })
      .returning();
    await audit(tx, { organizationId: current.lease.organizationId, userId: ctx.userId, action: "request.create", summary: `Demande de ${current.tenant.fullName} : ${input.subject}`, entityType: "request", entityId: r.id, ip: ctx.ip });
    await notifyStaff(tx, current.lease.organizationId, "request.manage", {
      title: "Nouvelle demande d'un locataire",
      body: `${current.tenant.fullName} (${current.unit.label}) : ${input.subject}`,
      link: "/demandes",
    });
    return r;
  });
}

export async function listRequests(ctx: Scope, status?: "OPEN" | "IN_PROGRESS" | "CLOSED") {
  return db
    .select({ request: requests, tenantName: tenants.fullName, tenantId: tenants.id, unitLabel: units.label, propertyName: properties.name })
    .from(requests)
    .innerJoin(leases, eq(leases.id, requests.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(propertyScope(ctx), status ? eq(requests.status, status) : undefined))
    .orderBy(desc(requests.updatedAt));
}

export const updateRequestSchema = z.object({ requestId: uuid, status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]), response: optText(1000) });

export async function updateRequest(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "request.manage");
  const input = updateRequestSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select({ request: requests, tenantUserId: tenants.userId })
      .from(requests)
      .innerJoin(leases, eq(leases.id, requests.leaseId))
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(requests.id, input.requestId), propertyScope(ctx)))
      .limit(1);
    if (!r) throw new NotFoundError("Demande");
    await tx.update(requests).set({ status: input.status, response: input.response ?? r.request.response, updatedAt: new Date() }).where(eq(requests.id, r.request.id));
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "request.update", summary: `Demande « ${r.request.subject} » : ${STATUS[input.status]}`, entityType: "request", entityId: r.request.id, ip: ctx.ip });
    if (r.tenantUserId)
      await notify(tx, { userId: r.tenantUserId, organizationId: ctx.orgId, title: `Demande « ${r.request.subject} » : ${STATUS[input.status]}`, body: input.response ?? "Statut mis à jour.", link: "/mon-espace/demandes" });
  });
}

const STATUS = { OPEN: "ouverte", IN_PROGRESS: "en cours", CLOSED: "terminée" } as const;

export async function listTenantRequests(leaseId: string) {
  return db.select().from(requests).where(eq(requests.leaseId, leaseId)).orderBy(desc(requests.createdAt));
}
