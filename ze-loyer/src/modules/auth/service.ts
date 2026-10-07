import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, owners, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearAttempts, createSession, isRateLimited, recordFailedAttempt } from "@/lib/auth/session";
import { BusinessError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { optEmail, optText, phone, reqText } from "@/lib/zod";
import { audit } from "@/modules/audit/service";
import { listSpaces } from "./context";

export const password = z.string({ message: "Mot de passe obligatoire" }).min(8, "Mot de passe : 8 caractères minimum").max(200);

export const signupSchema = z
  .object({
    fullName: reqText("Nom", 120),
    phone,
    email: optEmail,
    password,
    accountType: z.enum(["AGENCY", "OWNER", "TENANT"], { message: "Choisissez un type de compte" }),
    organizationName: optText(120),
  })
  .refine((v) => v.accountType !== "AGENCY" || !!v.organizationName, { message: "Nom de l'agence obligatoire", path: ["organizationName"] });

type Meta = { ip: string | null; userAgent: string | null };

export async function ensureAccountAvailable(phoneNumber: string, email: string | null) {
  const [exists] = await db
    .select({ phone: users.phone, email: users.email })
    .from(users)
    .where(email ? or(eq(users.phone, phoneNumber), eq(users.email, email)) : eq(users.phone, phoneNumber))
    .limit(1);
  if (exists) throw new BusinessError(exists.phone === phoneNumber ? "Ce numéro a déjà un compte. Connectez-vous." : "Cet email est déjà utilisé.");
}

export async function signup(raw: unknown, meta: Meta) {
  const input = signupSchema.parse(raw);
  await ensureAccountAvailable(input.phone, input.email);
  const passwordHash = await hashPassword(input.password);

  const { userId, orgId } = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ fullName: input.fullName, phone: input.phone, email: input.email, passwordHash }).returning({ id: users.id });
    let orgId: string | null = null;
    if (input.accountType !== "TENANT") {
      const [o] = await tx
        .insert(organizations)
        .values({
          name: input.accountType === "AGENCY" ? input.organizationName! : (input.organizationName ?? `Logements de ${input.fullName}`),
          kind: input.accountType,
          plan: input.accountType === "AGENCY" ? "AGENCE" : "FREE",
          phone: input.phone,
          email: input.email,
        })
        .returning({ id: organizations.id });
      orgId = o.id;
      await tx.insert(memberships).values({ organizationId: o.id, userId: u.id, role: "ADMIN" });
      // Un propriétaire indépendant est lui-même la fiche propriétaire de ses biens
      if (input.accountType === "OWNER")
        await tx.insert(owners).values({ organizationId: o.id, fullName: input.fullName, phone: input.phone, email: input.email, userId: u.id });
    }
    await audit(tx, { organizationId: orgId, userId: u.id, action: "user.signup", summary: `Compte créé (${input.accountType})`, entityType: "user", entityId: u.id, ip: meta.ip });
    return { userId: u.id, orgId };
  });

  const session = await createSession({ userId, organizationId: orgId, ...meta });
  return { session, userId, orgId };
}

export async function login(input: { identifier: string; password: string }, meta: Meta) {
  const identifier = input.identifier.trim().toLowerCase();
  if (!identifier || !input.password) throw new BusinessError("Saisissez votre téléphone et votre mot de passe.");
  const phoneNumber = normalizePhone(identifier);
  const keys = [`id:${phoneNumber ?? identifier}`, ...(meta.ip ? [`ip:${meta.ip}`] : [])];
  for (const k of keys)
    if (await isRateLimited(k)) throw new BusinessError("Trop de tentatives. Patientez 15 minutes puis réessayez.");

  const [u] = await db
    .select()
    .from(users)
    .where(phoneNumber ? eq(users.phone, phoneNumber) : eq(users.email, identifier))
    .limit(1);
  // Vérification même sans compte, pour un temps de réponse comparable
  const ok = u ? await verifyPassword(u.passwordHash, input.password) : (await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000", input.password), false);
  if (!u || !ok) {
    for (const k of keys) await recordFailedAttempt(k);
    throw new BusinessError("Téléphone ou mot de passe incorrect.");
  }
  for (const k of keys) await clearAttempts(k);

  const spaces = await listSpaces(u.id);
  const organizationId = spaces.orgs[0]?.id ?? null;
  const session = await createSession({ userId: u.id, organizationId: spaces.isTenant && !organizationId ? null : organizationId, ...meta });
  await audit(db, { organizationId, userId: u.id, action: "user.login", summary: "Connexion", entityType: "user", entityId: u.id, ip: meta.ip });
  return { session, organizationId };
}
