import type { Tx } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = {
  companyId: string | null;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

export async function audit(tx: Tx, e: AuditEntry) {
  await tx.insert(auditLogs).values({
    companyId: e.companyId,
    userId: e.userId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata,
    ip: e.ip ?? null,
  });
}
