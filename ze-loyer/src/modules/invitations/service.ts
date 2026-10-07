import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invitations, leases, memberships, organizations, owners, properties, tenants, units, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, hashToken, newToken } from "@/lib/auth/session";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { assertCan, ROLE_LABELS, type Role } from "@/lib/permissions";
import { phone, reqText } from "@/lib/zod";
import { getScopedTenant } from "../access";
import type { StaffCtx } from "../auth/context";
import { password } from "../auth/service";
import { audit } from "../audit/service";

const TTL_DAYS = 14;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Lien wa.me : ouvre WhatsApp sur le téléphone de l'utilisateur, qui envoie lui-même le message. */
export function whatsappLink(phoneNumber: string | null, message: string) {
  const digits = phoneNumber?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

async function insertInvitation(ctx: StaffCtx, v: { kind: "TENANT" | "OWNER" | "MEMBER"; fullName: string; phone: string; tenantId?: string; ownerId?: string; role?: Role }) {
  const token = newToken(24);
  await db.transaction(async (tx) => {
    // Un seul lien valide à la fois : les anciens expirent
    if (v.tenantId) await tx.update(invitations).set({ expiresAt: new Date() }).where(and(eq(invitations.tenantId, v.tenantId), isNull(invitations.acceptedAt)));
    if (v.ownerId) await tx.update(invitations).set({ expiresAt: new Date() }).where(and(eq(invitations.ownerId, v.ownerId), isNull(invitations.acceptedAt)));
    const [inv] = await tx
      .insert(invitations)
      .values({
        organizationId: ctx.orgId,
        kind: v.kind,
        tokenHash: hashToken(token),
        fullName: v.fullName,
        phone: v.phone,
        tenantId: v.tenantId ?? null,
        ownerId: v.ownerId ?? null,
        role: v.role ?? (v.kind === "OWNER" ? "OWNER" : null),
        expiresAt: new Date(Date.now() + TTL_DAYS * 86400000),
        createdBy: ctx.userId,
      })
      .returning({ id: invitations.id });
    await audit(tx, { organizationId: ctx.orgId, userId: ctx.userId, action: "invitation.create", summary: `Invitation créée pour ${v.fullName} (${v.kind === "TENANT" ? "locataire" : v.kind === "OWNER" ? "propriétaire" : ROLE_LABELS[v.role!]})`, entityType: "invitation", entityId: inv.id, ip: ctx.ip });
  });
  const url = `${appUrl()}/invitation/${token}`;
  const first = v.fullName.split(" ")[0];
  const message = `Bonjour ${first} 👋\n\nVotre espace ZE LOYER est prêt (${ctx.orgName}).\nCliquez ici pour créer votre accès :\n${url}`;
  return { url, message, whatsapp: whatsappLink(v.phone, message), expiresInDays: TTL_DAYS };
}

export async function inviteTenant(ctx: StaffCtx, tenantId: string) {
  assertCan(ctx.permissions, "invite.send");
  const t = await getScopedTenant(ctx, tenantId);
  if (t.userId) throw new BusinessError(`${t.fullName} a déjà son espace ZE LOYER.`);
  return insertInvitation(ctx, { kind: "TENANT", fullName: t.fullName, phone: t.phone, tenantId: t.id });
}

export async function inviteOwner(ctx: StaffCtx, ownerId: string) {
  assertCan(ctx.permissions, "owner.manage");
  const [o] = await db.select().from(owners).where(and(eq(owners.id, ownerId), eq(owners.organizationId, ctx.orgId))).limit(1);
  if (!o) throw new NotFoundError("Propriétaire");
  if (o.userId) throw new BusinessError(`${o.fullName} a déjà son accès.`);
  if (!o.phone) throw new BusinessError("Ajoutez d'abord le téléphone du propriétaire.");
  return insertInvitation(ctx, { kind: "OWNER", fullName: o.fullName, phone: o.phone, ownerId: o.id });
}

export const memberInviteSchema = z.object({
  fullName: reqText("Nom", 120),
  phone,
  role: z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "FIELD_AGENT"], { message: "Choisissez un rôle" }),
});

export async function inviteMember(ctx: StaffCtx, raw: unknown) {
  assertCan(ctx.permissions, "members.manage");
  const input = memberInviteSchema.parse(raw);
  return insertInvitation(ctx, { kind: "MEMBER", fullName: input.fullName, phone: input.phone, role: input.role });
}

/** Détails affichés sur la page d'invitation (sans exposer de données sensibles). */
export async function getInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [inv] = await db
    .select({ inv: invitations, orgName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  if (!inv) return null;
  let unitLabel: string | null = null;
  let propertyName: string | null = null;
  if (inv.inv.tenantId) {
    const [l] = await db
      .select({ unitLabel: units.label, propertyName: properties.name })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(leases.tenantId, inv.inv.tenantId), eq(leases.status, "ACTIVE")))
      .limit(1);
    unitLabel = l?.unitLabel ?? null;
    propertyName = l?.propertyName ?? null;
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, inv.inv.phone)).limit(1);
  return { ...inv.inv, orgName: inv.orgName, unitLabel, propertyName, hasAccount: !!existing };
}

type Meta = { ip: string | null; userAgent: string | null };

/**
 * Accepte une invitation.
 * - utilisateur connecté (`currentUserId`) : l'invitation est rattachée à son compte ;
 * - sinon : création du compte avec le téléphone de l'invitation.
 */
export async function acceptInvitation(token: string, a: { currentUserId: string | null; password?: string; email?: string | null }, meta: Meta) {
  const inv = await getInvitation(token);
  if (!inv) throw new BusinessError("Ce lien n'est plus valide. Demandez un nouveau lien à votre agence ou propriétaire.");

  let userId = a.currentUserId;
  if (!userId) {
    if (inv.hasAccount) throw new BusinessError("Ce numéro a déjà un compte : connectez-vous d'abord, puis rouvrez ce lien.");
    const pwd = password.parse(a.password);
    const passwordHash = await hashPassword(pwd);
    const [u] = await db.insert(users).values({ fullName: inv.fullName, phone: inv.phone, email: a.email ?? null, passwordHash }).returning({ id: users.id });
    userId = u.id;
  }

  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!claimed) throw new BusinessError("Cette invitation a déjà été utilisée.");
    if (inv.kind === "TENANT") {
      await tx.update(tenants).set({ userId }).where(eq(tenants.id, inv.tenantId!));
    } else {
      if (inv.kind === "OWNER") await tx.update(owners).set({ userId }).where(eq(owners.id, inv.ownerId!));
      await tx
        .insert(memberships)
        .values({ organizationId: inv.organizationId, userId: userId!, role: inv.role!, ownerId: inv.kind === "OWNER" ? inv.ownerId : null })
        .onConflictDoUpdate({ target: [memberships.organizationId, memberships.userId], set: { role: inv.role!, ownerId: inv.kind === "OWNER" ? inv.ownerId : null, active: true } });
    }
    await audit(tx, { organizationId: inv.organizationId, userId, action: "invitation.accept", summary: `${inv.fullName} a rejoint ZE LOYER`, entityType: "invitation", entityId: inv.id, ip: meta.ip });
  });

  const organizationId = inv.kind === "TENANT" ? null : inv.organizationId;
  const session = a.currentUserId ? null : await createSession({ userId: userId!, organizationId, ...meta });
  return { session, organizationId, kind: inv.kind };
}
