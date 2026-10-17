import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withTenant } from "@/db/tenant";
import { auditLogs, users } from "@/db/schema";
import { profileFromIdToken, readPendingProfile, signPendingProfile } from "@/lib/auth/google";
import { loginWithGoogle, signup } from "@/modules/auth/service";
import { newCompany } from "./helpers";

const CLIENT = "client-test.apps.googleusercontent.com";
const jwt = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 600,
  sub: "1234567890",
  email: "Ama.Mensah@Gmail.com",
  email_verified: true,
  name: "Ama Mensah",
  ...over,
});

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT;
  process.env.GOOGLE_CLIENT_SECRET = "secret-test";
});
afterAll(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe("connexion Google", () => {
  it("n'accepte que les jetons de Google, pour notre application, non expirés, avec email vérifié", () => {
    expect(profileFromIdToken(jwt(claims()), CLIENT)).toEqual({ sub: "1234567890", email: "ama.mensah@gmail.com", name: "Ama Mensah" });
    expect(() => profileFromIdToken(jwt(claims({ aud: "autre" })), CLIENT)).toThrow(/autre application/);
    expect(() => profileFromIdToken(jwt(claims({ iss: "https://evil.example" })), CLIENT)).toThrow(/Émetteur/);
    expect(() => profileFromIdToken(jwt(claims({ exp: 1 })), CLIENT)).toThrow(/expiré/);
    expect(() => profileFromIdToken(jwt(claims({ email_verified: false })), CLIENT)).toThrow(/non vérifiée/);
  });

  it("garde le profil en attente dans un cookie signé et infalsifiable", () => {
    const p = { sub: "1", email: "a@b.co", name: "A" };
    const v = signPendingProfile(p);
    expect(readPendingProfile(v)).toEqual(p);
    const [body, sig] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, email: "admin@b.co", exp: Date.now() + 1e6 })).toString("base64url");
    expect(readPendingProfile(`${forged}.${sig}`)).toBeNull();
    expect(readPendingProfile(`${body}.x${sig.slice(1)}`)).toBeNull();
    expect(readPendingProfile(signPendingProfile(p, Date.now() - 3600_000))).toBeNull();
  });

  it("inscrit avec l'adresse Google (déjà vérifiée), puis reconnecte le même compte", async () => {
    const email = `g${Date.now()}@gmail.com`;
    const google = { sub: "g1", email, name: "Kossi" };
    expect(await loginWithGoogle(google)).toBeNull();
    // L'email du formulaire est ignoré : seul celui de Google compte
    const res = await signup({ companyName: "Boutique Google", ownerName: "Kossi", email: "autre@exemple.com", password: "" }, {}, { google });
    expect(res.mustVerifyEmail).toBe(false);
    const [u] = await db.select().from(users).where(eq(users.id, res.userId));
    expect(u.email).toBe(email);
    expect(u.emailVerifiedAt).not.toBeNull();

    const again = await loginWithGoogle(google);
    expect(again).toMatchObject({ userId: res.userId, companyId: res.companyId });
    const logs = await withTenant({ companyId: res.companyId, userId: res.userId }, (tx) => tx.select().from(auditLogs));
    expect(logs.some((l) => l.action === "auth.login" && (l.metadata as { method?: string })?.method === "google")).toBe(true);
  });

  it("connecte un compte existant créé avec mot de passe et vérifie son adresse", async () => {
    const ctx = await newCompany("Client mot de passe");
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, ctx.userId));
    const done = await loginWithGoogle({ sub: "g2", email: ctx.user.email, name: "x" });
    expect(done?.userId).toBe(ctx.userId);
    const [u] = await db.select().from(users).where(eq(users.id, ctx.userId));
    expect(u.emailVerifiedAt).not.toBeNull();
  });
});
