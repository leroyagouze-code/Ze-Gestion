import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

export type AuditEntry = {
  organizationId: string | null;
  userId: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Journal en ajout seul (un trigger SQL interdit modification et suppression). */
export async function audit(tx: DbOrTx, e: AuditEntry) {
  await tx.insert(auditLogs).values({
    organizationId: e.organizationId,
    userId: e.userId,
    action: e.action,
    summary: e.summary,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata,
    ip: e.ip ?? null,
  });
}

export async function listAudit(organizationId: string, opts: { entityType?: string; entityId?: string; limit?: number } = {}) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      userName: users.fullName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(
      and(
        eq(auditLogs.organizationId, organizationId),
        opts.entityType ? eq(auditLogs.entityType, opts.entityType) : undefined,
        opts.entityId ? eq(auditLogs.entityId, opts.entityId) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit ?? 100);
}
