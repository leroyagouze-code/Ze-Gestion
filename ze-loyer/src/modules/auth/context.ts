import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, tenants } from "@/db/schema";
import { permissionsFor, type Permission, type Role } from "@/lib/permissions";

export type StaffCtx = {
  kind: "staff";
  userId: string;
  userName: string;
  orgId: string;
  orgName: string;
  orgKind: "AGENCY" | "OWNER";
  plan: string;
  role: Role;
  /** Rôle OWNER : restreint aux biens de cette fiche propriétaire */
  ownerId: string | null;
  permissions: ReadonlySet<Permission>;
  ip: string | null;
};

export type TenantCtx = {
  kind: "tenant";
  userId: string;
  userName: string;
  phone: string;
  ip: string | null;
};

export async function loadStaffContext(user: { userId: string; fullName: string }, orgId: string, ip: string | null): Promise<StaffCtx | null> {
  const [m] = await db
    .select({ role: memberships.role, ownerId: memberships.ownerId, org: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, user.userId), eq(memberships.organizationId, orgId), eq(memberships.active, true)))
    .limit(1);
  if (!m) return null;
  // Un rôle OWNER sans fiche propriétaire ne voit rien (sécurité par défaut)
  if (m.role === "OWNER" && !m.ownerId) return null;
  return {
    kind: "staff",
    userId: user.userId,
    userName: user.fullName,
    orgId,
    orgName: m.org.name,
    orgKind: m.org.kind,
    plan: m.org.plan,
    role: m.role,
    ownerId: m.role === "OWNER" ? m.ownerId : null,
    permissions: permissionsFor(m.role),
    ip,
  };
}

/** Espaces accessibles : organisations (agence / propriétaire) et/ou espace locataire. */
export async function listSpaces(userId: string) {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, kind: organizations.kind, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true)));
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.userId, userId), isNotNull(tenants.userId))).limit(1);
  return { orgs, isTenant: !!t };
}
