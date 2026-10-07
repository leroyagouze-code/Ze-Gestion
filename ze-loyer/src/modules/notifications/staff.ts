import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { memberships } from "@/db/schema";
import { ROLE_PERMISSIONS, type Permission, type Role } from "@/lib/permissions";
import { notify, type NotifyInput } from "./service";

/** Notifie les membres de l'organisation dont le rôle a la permission donnée. */
export async function notifyStaff(tx: DbOrTx, orgId: string, permission: Permission, n: Omit<NotifyInput, "userId" | "organizationId">) {
  const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => r !== "OWNER" && ROLE_PERMISSIONS[r].includes(permission));
  const members = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.active, true), inArray(memberships.role, roles)));
  for (const m of members) await notify(tx, { ...n, userId: m.userId, organizationId: orgId, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${m.userId}` : undefined });
}
