/*
 * RBAC : chaque rôle d'organisation reçoit une liste de permissions.
 * Vérifié côté serveur à chaque action (requireStaff / assertCan). L'interface ne fait que masquer.
 */
import { ForbiddenError } from "./errors";

export const PERMISSIONS = [
  "dashboard.view",
  "property.read",
  "property.write",
  "tenant.read",
  "tenant.write",
  "lease.write",
  "payment.read",
  "payment.write",
  "payment.cancel",
  "deposit.write",
  "report.read",
  "dispute.read",
  "dispute.resolve",
  "request.manage",
  "invite.send",
  "document.write",
  "audit.read",
  "owner.manage",
  "members.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = "ADMIN" | "MANAGER" | "ACCOUNTANT" | "FIELD_AGENT" | "OWNER";

const READ: Permission[] = ["dashboard.view", "property.read", "tenant.read", "payment.read", "report.read", "dispute.read"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: PERMISSIONS.filter((p) => p !== "members.manage" && p !== "settings.manage"),
  ACCOUNTANT: [...READ, "payment.write", "payment.cancel", "deposit.write", "dispute.resolve", "audit.read"],
  FIELD_AGENT: [...READ, "payment.write", "request.manage", "document.write"],
  // Propriétaire suivi par une agence : consultation de SES biens uniquement
  OWNER: [...READ],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  ACCOUNTANT: "Comptable",
  FIELD_AGENT: "Agent terrain",
  OWNER: "Propriétaire (consultation)",
};

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function can(perms: ReadonlySet<Permission>, p: Permission) {
  return perms.has(p);
}

export function assertCan(perms: ReadonlySet<Permission>, p: Permission) {
  if (!perms.has(p)) throw new ForbiddenError();
}
