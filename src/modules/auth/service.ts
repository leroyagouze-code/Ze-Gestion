import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  memberships,
  paymentMethods,
  plans,
  roles,
  stores,
  subscriptions,
  taxes,
  users,
  documentSequences,
} from "@/db/schema";
import { withTenant, withUser } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  clearAttempts,
  createSession,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/auth/session";
import { DEFAULT_SEQUENCES } from "@/modules/settings/sequences";
import { loginSchema, signupSchema, type SignupInput } from "./schemas";

export class AuthError extends Error {}

export const DEFAULT_PAYMENT_METHODS = [
  { code: "cash", label: "Espèces", type: "cash" },
  { code: "tmoney", label: "TMoney", type: "mobile_money" },
  { code: "flooz", label: "Flooz", type: "mobile_money" },
  { code: "card", label: "Carte bancaire", type: "card" },
  { code: "transfer", label: "Virement", type: "transfer" },
  { code: "mobile", label: "Paiement mobile", type: "mobile_money" },
  { code: "credit", label: "Crédit", type: "credit" },
  { code: "other", label: "Autre", type: "other" },
] as const;

const TRIAL_DAYS = 14;

let _dummy: Promise<string> | null = null;
const dummyHash = () => (_dummy ??= hashPassword("dummy-password-for-timing"));

/** Inscription : crée l'entreprise, l'administrateur et tout l'espace de travail par défaut. */
export async function signup(raw: SignupInput, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const input = signupSchema.parse(raw);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) throw new AuthError("Un compte existe déjà avec cet email");

  const passwordHash = await hashPassword(input.password);
  const companyId = randomUUID();
  const userId = randomUUID();

  await withTenant({ companyId, userId }, async (tx) => {
    await tx.insert(companies).values({
      id: companyId,
      name: input.companyName,
      ownerName: input.ownerName,
      email: input.email,
      phone: input.phone,
      whatsapp: input.whatsapp,
      address: input.address,
      city: input.city,
      country: input.country,
      currency: input.currency,
      taxId: input.taxId,
      billingAddress: input.billingAddress,
      extraInfo: input.extraInfo,
    });
    await tx.insert(users).values({
      id: userId,
      email: input.email,
      passwordHash,
      fullName: input.ownerName,
      phone: input.phone,
    });

    const insertedRoles = await tx
      .insert(roles)
      .values(DEFAULT_ROLES.map((r) => ({ companyId, name: r.name, permissions: r.permissions, isSystem: true })))
      .returning({ id: roles.id, name: roles.name });
    const adminRole = insertedRoles.find((r) => r.name === "Administrateur")!;

    const [store] = await tx
      .insert(stores)
      .values({ companyId, name: "Boutique principale", isDefault: true, address: input.address })
      .returning({ id: stores.id });

    await tx.insert(memberships).values({ companyId, userId, roleId: adminRole.id, storeId: store.id, isOwner: true });
    await tx.insert(taxes).values([
      { companyId, name: "TVA 18 %", rate: 18, isDefault: true },
      { companyId, name: "Exonéré", rate: 0 },
    ]);
    await tx
      .insert(paymentMethods)
      .values(DEFAULT_PAYMENT_METHODS.map((p, i) => ({ companyId, ...p, sortOrder: i })));
    const year = new Date().getFullYear();
    await tx
      .insert(documentSequences)
      .values(DEFAULT_SEQUENCES.map((s) => ({ companyId, ...s, currentYear: year })));

    const [free] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "FREE")).limit(1);
    if (free) {
      await tx.insert(subscriptions).values({
        companyId,
        planId: free.id,
        status: "trialing",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
      });
    }
    await audit(tx, { companyId, userId, action: "company.created", entityType: "company", entityId: companyId, ip: meta.ip });
  });

  const session = await createSession({ userId, companyId, ...meta });
  return { userId, companyId, session };
}

export async function login(
  raw: { email: string; password: string },
  meta: { ip?: string | null; userAgent?: string | null } = {},
) {
  const input = loginSchema.parse(raw);
  const key = `${meta.ip ?? "?"}:${input.email}`;
  if (await isRateLimited(key)) {
    throw new AuthError("Trop de tentatives. Réessayez dans 15 minutes.");
  }
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Vérification même si l'utilisateur n'existe pas, pour ne pas révéler les emails par le temps de réponse
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), input.password);
  if (!user || !ok) {
    await recordFailedAttempt(key);
    throw new AuthError("Email ou mot de passe incorrect");
  }
  await clearAttempts(key);

  const companyIds = await listUserCompanyIds(user.id);
  const companyId = companyIds[0] ?? null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  if (companyId) {
    await withTenant({ companyId, userId: user.id }, (tx) =>
      audit(tx, { companyId, userId: user.id, action: "auth.login", ip: meta.ip }),
    );
  }
  const session = await createSession({ userId: user.id, companyId, ...meta });
  return { userId: user.id, companyId, isSuperAdmin: user.isSuperAdmin, session };
}

export async function listUserCompanyIds(userId: string) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ companyId: memberships.companyId })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true), eq(companies.status, "active"))),
  );
  return rows.map((r) => r.companyId);
}
