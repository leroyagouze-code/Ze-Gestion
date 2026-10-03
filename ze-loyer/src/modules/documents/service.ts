import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { documents, leases, properties, tenants, units } from "@/db/schema";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { storeFile } from "@/lib/storage";
import { getScopedLease, type Scope } from "../access";
import type { StaffCtx } from "../auth/context";
import { audit } from "../audit/service";

export async function uploadLeaseDocument(ctx: StaffCtx, leaseId: string, input: { title: string; kind: "CONTRACT" | "OTHER"; file: File }) {
  assertCan(ctx.permissions, "document.write");
  const { lease, tenant } = await getScopedLease(ctx, leaseId);
  const title = input.title.trim() || (input.kind === "CONTRACT" ? "Contrat de location" : "Document");
  if (!input.file || input.file.size === 0) throw new BusinessError("Choisissez un fichier.");
  const stored = await storeFile(ctx.orgId, input.file);
  return db.transaction(async (tx) => {
    const [d] = await tx
      .insert(documents)
      .values({ organizationId: ctx.orgId, leaseId: lease.id, tenantId: tenant.id, kind: input.kind, title: title.slice(0, 120), storageKey: stored.key, mimeType: stored.mimeType, size: stored.size, uploadedBy: ctx.userId })
      .returning();
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "document.upload", summary: `Document « ${d.title} » ajouté pour ${tenant.fullName}`, entityType: "document", entityId: d.id, ip: ctx.ip });
    return d;
  });
}

/** Preuve jointe par un locataire (contestation). */
export async function storeTenantProof(tx: DbOrTx, a: { orgId: string; leaseId: string; tenantId: string; userId: string; file: File }) {
  const stored = await storeFile(a.orgId, a.file);
  const [d] = await tx
    .insert(documents)
    .values({ organizationId: a.orgId, leaseId: a.leaseId, tenantId: a.tenantId, kind: "PROOF", title: "Preuve jointe par le locataire", storageKey: stored.key, mimeType: stored.mimeType, size: stored.size, uploadedBy: a.userId })
    .returning();
  return d;
}

export async function listLeaseDocuments(leaseId: string) {
  return db.select().from(documents).where(eq(documents.leaseId, leaseId)).orderBy(desc(documents.createdAt));
}

/** Accès à un document : personnel du périmètre, ou locataire titulaire du bail. */
export async function getDocumentFor(viewer: { kind: "staff"; ctx: Scope } | { kind: "tenant"; userId: string }, documentId: string) {
  const [r] = await db
    .select({ doc: documents, tenantUserId: tenants.userId, ownerId: properties.ownerId })
    .from(documents)
    .innerJoin(leases, eq(leases.id, documents.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!r) throw new NotFoundError("Document");
  const ok =
    viewer.kind === "tenant"
      ? r.tenantUserId === viewer.userId
      : r.doc.organizationId === viewer.ctx.orgId && (!viewer.ctx.ownerId || viewer.ctx.ownerId === r.ownerId);
  if (!ok) throw new NotFoundError("Document");
  return r.doc;
}

