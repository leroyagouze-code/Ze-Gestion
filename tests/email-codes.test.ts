import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailCodes, sessions, subscriptions, users } from "@/db/schema";
import { flushMail, setMailTransport, type MailMessage } from "@/lib/mail";
import { validateSessionToken } from "@/lib/auth/session";
import {
  login,
  needsEmailVerification,
  requestPasswordReset,
  resetPasswordWithCode,
  sendVerificationCode,
  signup,
  verifyEmailCode,
} from "@/modules/auth/service";
import { addMember, listMembers } from "@/modules/users/service";
import { newCompany } from "./helpers";

// Faux transport : garde les emails en mémoire au lieu de les envoyer
const outbox: (MailMessage & { from: string })[] = [];
const fake = { send: async (m: MailMessage & { from: string }) => void outbox.push(m) };

beforeAll(() => setMailTransport(fake));
afterAll(() => setMailTransport(undefined));
beforeEach(() => {
  outbox.length = 0;
});

const email = (p = "mail") => `${p}-${randomUUID()}@test.local`;
const lastCodeFor = (to: string) => {
  const m = [...outbox].reverse().find((x) => x.to === to);
  if (!m) throw new Error(`aucun email pour ${to}`);
  return m.text.match(/\b(\d{6})\b/)![1];
};
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function newUser(address = email()) {
  const res = await signup({ companyName: "Boutique Mail", ownerName: "Ama Test", email: address, password: "motdepasse123" });
  return { ...res, email: address };
}

async function user(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

// Recule la date de création des codes pour passer le délai de 60 s entre deux envois
const skipCooldown = (userId: string) =>
  db.update(emailCodes).set({ createdAt: sql`now() - interval '2 minutes'` }).where(eq(emailCodes.userId, userId));

describe("vérification de l'email à l'inscription", () => {
  it("envoie un code à 6 chiffres qui confirme l'adresse", async () => {
    const u = await newUser();
    expect(u.mustVerifyEmail).toBe(true);
    expect(needsEmailVerification(await user(u.userId))).toBe(true);
    expect(outbox).toHaveLength(1);
    const mail = outbox[0];
    expect(mail.from).toContain("noreply@zegroupafrica.com");
    expect(mail.subject).toMatch(/ZE Gestion/);
    expect(mail.html).toContain("ZE Gestion");
    const code = lastCodeFor(u.email);
    expect(code).toMatch(/^\d{6}$/);

    // Seule l'empreinte est en base
    const [row] = await db.select().from(emailCodes).where(eq(emailCodes.userId, u.userId));
    expect(row.codeHash).not.toContain(code);
    expect(row.purpose).toBe("verify_email");

    await expect(verifyEmailCode(u.userId, wrong(code))).rejects.toThrow(/Code incorrect. Il vous reste 4 essais/);
    await verifyEmailCode(u.userId, code.slice(0, 3) + " " + code.slice(3)); // espaces tolérés
    const after = await user(u.userId);
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(needsEmailVerification(after)).toBe(false);
    expect((await login({ email: u.email, password: "motdepasse123" })).mustVerifyEmail).toBe(false);
    // Déjà vérifié : plus d'envoi
    expect(await sendVerificationCode(u.userId)).toBe(false);
  });

  it("bloque le code après 5 essais faux", async () => {
    const u = await newUser();
    const code = lastCodeFor(u.email);
    for (let i = 0; i < 4; i++) await expect(verifyEmailCode(u.userId, wrong(code))).rejects.toThrow(/Code incorrect/);
    await expect(verifyEmailCode(u.userId, wrong(code))).rejects.toThrow(/Trop d'essais/);
    // Même le bon code est refusé ensuite
    await expect(verifyEmailCode(u.userId, code)).rejects.toThrow(/Trop d'essais/);
    expect((await user(u.userId)).emailVerifiedAt).toBeNull();

    // Un nouveau code (après le délai) remet les compteurs à zéro et annule l'ancien
    await skipCooldown(u.userId);
    expect(await sendVerificationCode(u.userId)).toBe(true);
    const fresh = lastCodeFor(u.email);
    if (fresh !== code) await expect(verifyEmailCode(u.userId, code)).rejects.toThrow(/Code incorrect/);
    await verifyEmailCode(u.userId, fresh);
    expect((await user(u.userId)).emailVerifiedAt).not.toBeNull();
  });

  it("refuse un code expiré (10 minutes)", async () => {
    const u = await newUser();
    const code = lastCodeFor(u.email);
    const [row] = await db.select().from(emailCodes).where(eq(emailCodes.userId, u.userId));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(10 * 60_000);
    await db.update(emailCodes).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(emailCodes.userId, u.userId));
    await expect(verifyEmailCode(u.userId, code)).rejects.toThrow(/expiré/);
  });

  it("impose 60 s entre deux envois et 5 envois par heure", async () => {
    const u = await newUser();
    await expect(sendVerificationCode(u.userId)).rejects.toThrow(/Patientez \d+ s/);
    for (let i = 0; i < 4; i++) {
      await skipCooldown(u.userId);
      expect(await sendVerificationCode(u.userId)).toBe(true);
    }
    await skipCooldown(u.userId);
    await expect(sendVerificationCode(u.userId)).rejects.toThrow(/Trop de codes/);
    expect(outbox.filter((m) => m.to === u.email)).toHaveLength(5);
  });

  it("un employé créé par l'administrateur confirme son email à la première connexion", async () => {
    const ctx = await newCompany("Boutique Employés");
    await db.update(subscriptions).set({ planId: sql`(select id from plans where code = 'BUSINESS')` }).where(eq(subscriptions.companyId, ctx.companyId));
    const { roles } = await listMembers(ctx);
    const address = email("emp");
    const userId = await addMember(ctx, { fullName: "Employé", email: address, password: "provisoire123", roleId: roles.find((r) => r.name === "Caissier")!.id });
    expect((await user(userId)).emailVerifiedAt).toBeNull();
    const res = await login({ email: address, password: "provisoire123" });
    expect(res.mustVerifyEmail).toBe(true);
    const s = await validateSessionToken(res.session.token);
    expect(s?.emailVerifiedAt).toBeNull();
  });
});

describe("mot de passe oublié", () => {
  it("réinitialise avec le code et ferme toutes les sessions", async () => {
    const u = await newUser();
    await verifyEmailCode(u.userId, lastCodeFor(u.email));
    const other = await login({ email: u.email, password: "motdepasse123" });
    expect(await validateSessionToken(other.session.token)).not.toBeNull();

    await requestPasswordReset({ email: u.email.toUpperCase() });
    await flushMail();
    const code = lastCodeFor(u.email);
    expect(outbox.at(-1)!.subject).toMatch(/mot de passe/);

    await expect(resetPasswordWithCode({ email: u.email, code: wrong(code), password: "nouveaumdp123", confirm: "nouveaumdp123" })).rejects.toThrow(
      /Code incorrect ou expiré/,
    );
    await expect(resetPasswordWithCode({ email: u.email, code, password: "nouveaumdp123", confirm: "autre" })).rejects.toThrow(/correspondent pas/);
    await resetPasswordWithCode({ email: u.email, code, password: "nouveaumdp123", confirm: "nouveaumdp123" });

    const left = await db.select().from(sessions).where(eq(sessions.userId, u.userId));
    expect(left).toHaveLength(0);
    expect(await validateSessionToken(u.session.token)).toBeNull();
    expect(await validateSessionToken(other.session.token)).toBeNull();
    await expect(login({ email: u.email, password: "motdepasse123" })).rejects.toThrow(/incorrect/);
    expect((await login({ email: u.email, password: "nouveaumdp123" })).userId).toBe(u.userId);

    // Usage unique
    await expect(resetPasswordWithCode({ email: u.email, code, password: "encoreautre123", confirm: "encoreautre123" })).rejects.toThrow(/Code incorrect ou expiré/);
  });

  it("répond pareil pour une adresse inconnue, sans rien envoyer", async () => {
    const known = await newUser();
    outbox.length = 0;
    const unknown = email("inconnu");
    const a = await requestPasswordReset({ email: known.email });
    const b = await requestPasswordReset({ email: unknown });
    await flushMail();
    expect(a).toEqual(b);
    expect(outbox.map((m) => m.to)).toEqual([known.email]);
    const errKnown = await resetPasswordWithCode({ email: known.email, code: wrong(lastCodeFor(known.email)), password: "nouveaumdp123", confirm: "nouveaumdp123" }).catch((e: Error) => e.message);
    const errUnknown = await resetPasswordWithCode({ email: unknown, code: "123456", password: "nouveaumdp123", confirm: "nouveaumdp123" }).catch((e: Error) => e.message);
    expect(errUnknown).toBe(errKnown);

    // Deuxième demande immédiate : pas de nouvel email, même réponse
    await requestPasswordReset({ email: known.email });
    await flushMail();
    expect(outbox.filter((m) => m.to === known.email)).toHaveLength(1);
  });

  it("limite les demandes par adresse, qu'elle existe ou non", async () => {
    const unknown = email("limite");
    for (let i = 0; i < 5; i++) await requestPasswordReset({ email: unknown });
    await expect(requestPasswordReset({ email: unknown })).rejects.toThrow(/Trop de demandes/);
  });

  it("bloque le code de réinitialisation après 5 essais", async () => {
    const u = await newUser();
    await requestPasswordReset({ email: u.email });
    await flushMail();
    const code = lastCodeFor(u.email);
    const body = { email: u.email, password: "nouveaumdp123", confirm: "nouveaumdp123" };
    for (let i = 0; i < 5; i++) await expect(resetPasswordWithCode({ ...body, code: wrong(code) })).rejects.toThrow(/Code incorrect/);
    await expect(resetPasswordWithCode({ ...body, code })).rejects.toThrow(/Code incorrect ou expiré/);
    const [row] = await db
      .select()
      .from(emailCodes)
      .where(and(eq(emailCodes.userId, u.userId), eq(emailCodes.purpose, "reset_password")));
    expect(row.attempts).toBe(5);
  });
});

describe("sans envoi d'emails (Windows, développement)", () => {
  it("considère les comptes vérifiés et renvoie vers l'administrateur", async () => {
    setMailTransport(null);
    try {
      const u = await newUser();
      expect(u.mustVerifyEmail).toBe(false);
      expect((await user(u.userId)).emailVerifiedAt).not.toBeNull();
      expect(outbox).toHaveLength(0);
      await expect(requestPasswordReset({ email: u.email })).rejects.toThrow(/administrateur/);
    } finally {
      setMailTransport(fake);
    }
  });
});
