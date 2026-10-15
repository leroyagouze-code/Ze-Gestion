import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, memberships, plans, registers, roles, stores, subscriptions, users } from "@/db/schema";
import { assertOwned } from "@/db/owned";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { mailEnabled } from "@/lib/mail";
import { deleteUserSessions, newToken } from "@/lib/auth/session";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { pageParams } from "@/lib/pagination";
import { optText, optUuid } from "@/lib/zod";
import { ADMIN_ROLE, ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { ctxAssert, type AppContext } from "@/modules/auth/context";

type RoleRow = { name: string; isSystem: boolean; permissions: string[] };
const isAdminRole = (r: RoleRow) => r.isSystem && r.name === ADMIN_ROLE;

/**
 * Garde-fou contre l'élévation de droits : seul l'administrateur peut tout attribuer.
 * Un autre gestionnaire des utilisateurs ne peut attribuer ou modifier que des rôles
 * dont toutes les permissions sont déjà les siennes, et jamais le rôle Administrateur.
 */
function assertCanGrant(ctx: AppContext, r: RoleRow) {
  if (ctx.isAdmin) return;
  if (isAdminRole(r)) throw new BusinessError("Seul un administrateur peut attribuer ou modifier le rôle Administrateur");
  const extra = r.permissions.filter((p) => !ctx.permissions.includes(p));
  if (extra.length) throw new BusinessError("Vous ne pouvez pas attribuer des droits que vous n'avez pas vous-même");
}

export async function listMembers(ctx: AppContext) {
  ctxAssert(ctx, "users.manage");
  return withTenant(ctx, async (tx) => ({
    members: await tx
      .select({
        id: memberships.id,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        roleId: roles.id,
        roleName: roles.name,
        storeName: stores.name,
        registerId: memberships.registerId,
        isOwner: memberships.isOwner,
        isActive: memberships.isActive,
        lastLoginAt: users.lastLoginAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .leftJoin(stores, eq(stores.id, memberships.storeId))
      .where(eq(memberships.companyId, ctx.companyId))
      .orderBy(users.fullName),
    roles: await tx.select().from(roles).orderBy(roles.name),
    stores: await tx.select({ id: stores.id, name: stores.name }).from(stores).where(eq(stores.isActive, true)),
    registers: await tx.select({ id: registers.id, name: registers.name }).from(registers).where(eq(registers.isActive, true)).orderBy(registers.number),
  }));
}

async function enforceUserLimit(ctx: AppContext) {
  const [row] = await db
    .select({ limits: plans.limits, unlimited: subscriptions.unlimited })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, ctx.companyId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const max = row?.unlimited ? null : row?.limits.maxUsers;
  if (max == null) return;
  const [{ count }] = await withTenant(ctx, (tx) =>
    tx.select({ count: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.isActive, true))),
  );
  if (count >= max) throw new BusinessError(`Votre formule est limitée à ${max} utilisateur(s). Passez à une formule supérieure.`);
}

export const newUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  phone: optText(40),
  password: z.string().min(8, "8 caractères minimum"),
  roleId: z.string().uuid(),
  storeId: optUuid,
});

/**
 * Ajoute un utilisateur avec un mot de passe provisoire, qu'il devra changer à sa première connexion.
 * Un email qui a déjà un compte n'est jamais rattaché en silence : son titulaire n'a rien accepté.
 */
export async function addMember(ctx: AppContext, raw: z.input<typeof newUserSchema>) {
  ctxAssert(ctx, "users.manage");
  const input = newUserSchema.parse(raw);
  await enforceUserLimit(ctx);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) throw new BusinessError("Cet email a déjà un compte. Utilisez une autre adresse pour cet employé.");
  const passwordHash = await hashPassword(input.password);
  return withTenant(ctx, async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId));
    if (!role) throw new NotFoundError("Rôle");
    assertCanGrant(ctx, role);
    const [u] = await tx
      .insert(users)
      // Adresse à confirmer par code à la première connexion (si les emails sont configurés)
      .values({ email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash, mustChangePassword: true, emailVerifiedAt: mailEnabled() ? null : new Date() })
      .returning({ id: users.id });
    const userId = u.id;
    await tx.insert(memberships).values({ companyId: ctx.companyId, userId, roleId: input.roleId, storeId: input.storeId ?? null });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "user.added", entityType: "user", entityId: userId, metadata: { email: input.email }, ip: ctx.ip });
    return userId;
  });
}

export async function updateMember(
  ctx: AppContext,
  membershipId: string,
  patch: { roleId?: string; storeId?: string | null; registerId?: string | null; isActive?: boolean },
) {
  ctxAssert(ctx, "users.manage");
  return withTenant(ctx, async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
    if (!m) throw new NotFoundError("Utilisateur");
    await assertOwned(tx, stores, patch.storeId, "Boutique");
    await assertOwned(tx, registers, patch.registerId, "Caisse");
    if (m.isOwner && (patch.isActive === false || patch.roleId)) throw new BusinessError("Le propriétaire du compte ne peut pas être désactivé ni changer de rôle");
    if (m.userId === ctx.userId && patch.isActive === false) throw new BusinessError("Vous ne pouvez pas vous désactiver vous-même");
    if (m.userId === ctx.userId && patch.roleId && !ctx.isAdmin) throw new BusinessError("Vous ne pouvez pas changer votre propre rôle");
    // Le membre visé : un non-administrateur ne peut pas toucher à un compte plus puissant que lui.
    const [current] = await tx.select().from(roles).where(eq(roles.id, m.roleId));
    if (current) assertCanGrant(ctx, current);
    if (patch.roleId) {
      const [next] = await tx.select().from(roles).where(eq(roles.id, patch.roleId));
      if (!next) throw new NotFoundError("Rôle");
      assertCanGrant(ctx, next);
    }
    await tx.update(memberships).set(patch).where(eq(memberships.id, membershipId));
    if (patch.isActive === false) await deleteUserSessions(m.userId);
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "user.updated", entityType: "user", entityId: m.userId, metadata: patch, ip: ctx.ip });
  });
}

/**
 * Réinitialise le mot de passe d'un employé : nouveau mot de passe provisoire affiché une seule fois,
 * sessions fermées, changement obligatoire à la connexion suivante. Tracé dans le journal.
 */
export async function resetMemberPassword(ctx: AppContext, membershipId: string) {
  ctxAssert(ctx, "users.manage");
  return withTenant(ctx, async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
    if (!m) throw new NotFoundError("Utilisateur");
    if (m.userId === ctx.userId) throw new BusinessError("Pour votre propre compte, utilisez « Mot de passe » dans le menu");
    if (m.isOwner) throw new BusinessError("Le mot de passe du propriétaire ne peut être changé que par lui-même");
    const [role] = await tx.select().from(roles).where(eq(roles.id, m.roleId));
    if (role) assertCanGrant(ctx, role);
    // Un compte présent dans une autre entreprise ne doit pas pouvoir être repris depuis celle-ci
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.userId, m.userId), sql`${memberships.companyId} <> ${ctx.companyId}`));
    if (count > 0) throw new BusinessError("Ce compte est aussi utilisé dans une autre entreprise : son titulaire doit changer lui-même son mot de passe");
    const temporary = newToken(9).replace(/[-_]/g, "x");
    await tx.update(users).set({ passwordHash: await hashPassword(temporary), mustChangePassword: true }).where(eq(users.id, m.userId));
    await deleteUserSessions(m.userId);
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "user.password_reset", entityType: "user", entityId: m.userId, ip: ctx.ip });
    return temporary;
  });
}

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
});

export async function saveRole(ctx: AppContext, id: string | null, raw: z.input<typeof roleSchema>) {
  ctxAssert(ctx, "users.manage");
  const input = roleSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    if (id) {
      const [r] = await tx.select().from(roles).where(eq(roles.id, id));
      if (!r) throw new NotFoundError("Rôle");
      if (isAdminRole(r)) throw new BusinessError("Le rôle Administrateur détient toujours tous les droits et ne peut pas être modifié");
      assertCanGrant(ctx, r);
      assertCanGrant(ctx, { name: input.name, isSystem: false, permissions: input.permissions });
      await tx.update(roles).set({ name: r.isSystem ? r.name : input.name, permissions: input.permissions }).where(eq(roles.id, id));
      await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "role.updated", entityType: "role", entityId: id, metadata: { permissions: input.permissions }, ip: ctx.ip });
      return id;
    }
    assertCanGrant(ctx, { name: input.name, isSystem: false, permissions: input.permissions });
    const [dup] = await tx.select({ id: roles.id }).from(roles).where(sql`lower(${roles.name}) = lower(${input.name})`);
    if (dup) throw new BusinessError("Un rôle porte déjà ce nom");
    const [r] = await tx.insert(roles).values({ companyId: ctx.companyId, name: input.name, permissions: input.permissions }).returning({ id: roles.id });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "role.created", entityType: "role", entityId: r.id, metadata: { name: input.name }, ip: ctx.ip });
    return r.id;
  });
}

/** Supprime un rôle personnalisé qui n'est attribué à personne. Les rôles par défaut sont conservés. */
export async function deleteRole(ctx: AppContext, id: string) {
  ctxAssert(ctx, "users.manage");
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(roles).where(eq(roles.id, id));
    if (!r) throw new NotFoundError("Rôle");
    if (r.isSystem) throw new BusinessError("Les rôles par défaut ne peuvent pas être supprimés");
    assertCanGrant(ctx, r);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.roleId, id));
    if (count > 0) throw new BusinessError(`Ce rôle est attribué à ${count} utilisateur(s). Changez d'abord leur rôle.`);
    await tx.delete(roles).where(eq(roles.id, id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "role.deleted", entityType: "role", entityId: id, metadata: { name: r.name }, ip: ctx.ip });
  });
}

/** Nom affiché chez le client pour les actions faites par la plateforme (super admin). */
export const PLATFORM_ACTOR = "Équipe ZE Gestion";

/**
 * Les actions de la plateforme (essai prolongé, paiement enregistré, suspension…) restent tracées avec
 * l'identifiant du super admin en base, mais le client ne voit ni son nom, ni son IP, ni la note interne.
 */
function platformAsTeam<T extends { action: string; userName: string | null; ip: string | null; metadata: unknown }>(row: T): T {
  if (!row.action.startsWith("platform.")) return row;
  const meta = row.metadata && typeof row.metadata === "object" ? { ...(row.metadata as Record<string, unknown>) } : row.metadata;
  if (meta && typeof meta === "object") delete (meta as Record<string, unknown>).note;
  return { ...row, userName: PLATFORM_ACTOR, ip: null, metadata: meta };
}

export async function listAudit(ctx: AppContext, opts: { page?: number }) {
  ctxAssert(ctx, "audit.view");
  const { limit, offset, page } = pageParams(opts.page, 50);
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        userName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
    return { rows: rows.map(platformAsTeam), total: count, page, pageSize: limit };
  });
}
