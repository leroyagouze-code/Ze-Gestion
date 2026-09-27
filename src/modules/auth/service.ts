import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
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
  deleteUserSessions,
} from "@/lib/auth/session";
import { z } from "zod";
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
const HOUR = 3600_000;

/**
 * Limites anti-force brute, en plus du couple IP + email (5 échecs / 15 min) :
 * - par compte, quelle que soit l'IP (attaque distribuée) ;
 * - par IP, quel que soit l'email (balayage de comptes, et chaque essai coûte 19 Mo d'argon2) ;
 * - inscriptions par IP (création massive d'entreprises).
 */
export const LIMITS = {
  account: { max: 20, windowMs: HOUR },
  ip: { max: 50, windowMs: 15 * 60_000 },
  signup: { max: 5, windowMs: HOUR },
} as const;

let _dummy: Promise<string> | null = null;
const dummyHash = () => (_dummy ??= hashPassword("dummy-password-for-timing"));

/** Inscription : crée l'entreprise, l'administrateur et tout l'espace de travail par défaut. */
export async function signup(raw: SignupInput, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const input = signupSchema.parse(raw);
  // Sans IP connue (scripts, tests), pas de limite : une clé commune bloquerait tout le monde
  const signupKey = meta.ip ? `signup:${meta.ip}` : null;
  if (signupKey && (await isRateLimited(signupKey, LIMITS.signup.max, LIMITS.signup.windowMs))) {
    throw new AuthError("Trop d'inscriptions depuis cette connexion. Réessayez plus tard.");
  }
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

  if (signupKey) await recordFailedAttempt(signupKey, LIMITS.signup.windowMs); // compte les inscriptions réussies
  const session = await createSession({ userId, companyId, ...meta });
  return { userId, companyId, session };
}

export async function login(
  raw: { email: string; password: string },
  meta: { ip?: string | null; userAgent?: string | null } = {},
) {
  const input = loginSchema.parse(raw);
  const key = `${meta.ip ?? "?"}:${input.email}`;
  const accountKey = `acct:${input.email}`;
  const ipKey = meta.ip ? `ip:${meta.ip}` : null;
  if (
    (await isRateLimited(key)) ||
    (await isRateLimited(accountKey, LIMITS.account.max, LIMITS.account.windowMs)) ||
    (ipKey !== null && (await isRateLimited(ipKey, LIMITS.ip.max, LIMITS.ip.windowMs)))
  ) {
    throw new AuthError("Trop de tentatives. Réessayez dans 15 minutes.");
  }
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Vérification même si l'utilisateur n'existe pas, pour ne pas révéler les emails par le temps de réponse
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), input.password);
  if (!user || !ok) {
    await recordFailedAttempt(key);
    await recordFailedAttempt(accountKey, LIMITS.account.windowMs);
    if (ipKey) await recordFailedAttempt(ipKey, LIMITS.ip.windowMs);
    throw new AuthError("Email ou mot de passe incorrect");
  }
  await clearAttempts(key);
  await clearAttempts(accountKey);

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

export const passwordSchema = z.string().min(8, "8 caractères minimum").max(200, "200 caractères maximum");

/**
 * Changement de mot de passe par l'utilisateur lui-même. Vérifie l'ancien mot de passe,
 * lève l'obligation de changement et ferme ses autres sessions (autres appareils).
 */
export async function changePassword(
  user: { userId: string; companyId: string | null; ip?: string | null },
  raw: { current: string; next: string; confirm: string },
  keepToken: string,
) {
  const next = passwordSchema.parse(raw.next);
  if (next !== raw.confirm) throw new AuthError("Les deux nouveaux mots de passe ne correspondent pas");
  if (next === raw.current) throw new AuthError("Choisissez un mot de passe différent de l'actuel");
  const [u] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  if (!u || !(await verifyPassword(u.passwordHash, raw.current))) throw new AuthError("Mot de passe actuel incorrect");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() })
    .where(eq(users.id, u.id));
  await deleteUserSessions(u.id, keepToken);
  if (user.companyId) {
    await withTenant({ companyId: user.companyId, userId: u.id }, (tx) =>
      audit(tx, { companyId: user.companyId, userId: u.id, action: "auth.password_changed", entityType: "user", entityId: u.id, ip: user.ip }),
    );
  }
}

export async function listUserCompanyIds(userId: string) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ companyId: memberships.companyId })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true), eq(companies.status, "active")))
      // Ordre stable : toujours la même entreprise à la connexion (la plus ancienne adhésion)
      .orderBy(asc(memberships.createdAt)),
  );
  return rows.map((r) => r.companyId);
}
