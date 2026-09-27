import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { can } from "@/lib/permissions";
import { newCompany } from "./helpers";

// Paire de clés de test : la vraie clé privée ne quitte jamais le serveur de ZE GROUP.
const jwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const TEST_D = jwk.d!;
const TEST_X = jwk.x!;

vi.mock("@/lib/license", async (orig) => {
  const real = await orig<typeof import("@/lib/license")>();
  return { ...real, verifyLicense: (code: string, id: string) => real.verifyLicense(code, id, TEST_X) };
});

const { createLicense, normalizeCode, verifyLicense } = await vi.importActual<typeof import("@/lib/license")>("@/lib/license");
const { activateLicense, issueLicense, licenseEnd } = await import("@/modules/billing/license");

const PC = "7K2P-QX9M";
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const reload = async (ctx: AppContext) =>
  (await loadContext({ userId: ctx.userId, fullName: ctx.user.fullName, email: ctx.user.email, isSuperAdmin: false }, ctx.companyId))!;

describe("codes de licence", () => {
  it("n'accepte qu'un code signé, pour le bon ordinateur", () => {
    const code = createLicense(TEST_D, PC, "PRO", inDays(400));
    expect(verifyLicense(code, PC, TEST_X)).toMatchObject({ plan: "PRO" });
    expect(verifyLicense(code.toLowerCase().replace(/-/g, " "), "7k2p qx9m", TEST_X)).toMatchObject({ plan: "PRO" });
    expect(verifyLicense(code, "AAAA-BBBB", TEST_X)).toBeNull();
    // Un caractère modifié dans la signature (le dernier caractère porte aussi des bits de remplissage)
    const raw = normalizeCode(code);
    const tampered = raw.slice(0, 50) + (raw[50] === "A" ? "B" : "A") + raw.slice(51);
    expect(verifyLicense(tampered, PC, TEST_X)).toBeNull();
    // Signé avec une autre clé : refusé par la clé intégrée au logiciel
    expect(verifyLicense(code, PC)).toBeNull();
    expect(verifyLicense(createLicense(TEST_D, PC, "BASIC", null), PC, TEST_X)).toEqual({ plan: "BASIC", expiresAt: null });
  });

  it("refuse un code d'installation mal formé", () => {
    expect(() => createLicense(TEST_D, "12", "PRO", null)).toThrow(/installation/);
  });
});

describe("logiciel de bureau", () => {
  beforeAll(() => {
    vi.stubEnv("ZE_EDITION", "desktop");
    vi.stubEnv("ZE_INSTALL_ID", PC);
  });
  afterAll(() => vi.unstubAllEnvs());

  it("essai, puis lecture seule, puis déblocage par code, puis expiration", async () => {
    let ctx = await newCompany();
    const [pro] = await db.select().from(plans).where(eq(plans.code, "PRO"));
    await db.update(subscriptions).set({ trialEndsAt: inDays(-1) }).where(eq(subscriptions.companyId, ctx.companyId));
    ctx = await reload(ctx);
    expect(ctx.subscription).toMatchObject({ status: "trialing", readOnly: true });
    expect(can(ctx.permissions, "sales.create")).toBe(false);

    await expect(activateLicense(ctx, createLicense(TEST_D, "AAAA-BBBB", "PRO", inDays(30)))).rejects.toThrow(/invalide/);
    await expect(activateLicense({ ...ctx, isAdmin: false }, createLicense(TEST_D, PC, "PRO", inDays(30)))).rejects.toThrow(/administrateur/);

    await activateLicense(ctx, createLicense(TEST_D, PC, "PRO", inDays(30)));
    ctx = await reload(ctx);
    expect(ctx.subscription).toMatchObject({ status: "active", planName: "Pro", readOnly: false });
    // Le code arrondit la fin au jour près
    expect(ctx.subscription.periodDaysLeft).toBeGreaterThanOrEqual(30);
    expect(ctx.subscription.periodDaysLeft).toBeLessThanOrEqual(31);
    expect(can(ctx.permissions, "sales.create")).toBe(true);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, ctx.companyId));
    expect(sub.planId).toBe(pro.id);

    // Modifier la date de fin en base ne sert à rien : seul le code signé compte
    await db.update(subscriptions).set({ currentPeriodEnd: inDays(9999) }).where(eq(subscriptions.companyId, ctx.companyId));
    expect((await reload(ctx)).subscription.periodDaysLeft).toBeLessThanOrEqual(31);

    // Base copiée sur un autre ordinateur : retour à l'essai (terminé)
    vi.stubEnv("ZE_INSTALL_ID", "AAAA-BBBB");
    expect((await reload(ctx)).subscription).toMatchObject({ status: "trialing", readOnly: true });
    vi.stubEnv("ZE_INSTALL_ID", PC);

    // Licence à vie
    await activateLicense(ctx, createLicense(TEST_D, PC, "BUSINESS", null));
    expect((await reload(ctx)).subscription).toMatchObject({ unlimited: true, readOnly: false, planName: "Business" });
  });

  it("refuse un code déjà expiré", async () => {
    const ctx = await newCompany();
    await expect(activateLicense(ctx, createLicense(TEST_D, PC, "PRO", inDays(-2)))).rejects.toThrow(/expiré/);
  });
});

describe("création des codes (super admin)", () => {
  it("exige la clé privée et le rôle super admin", async () => {
    vi.stubEnv("LICENSE_PRIVATE_KEY", "");
    await expect(issueLicense({ userId: crypto.randomUUID(), isSuperAdmin: true }, {})).rejects.toThrow(/LICENSE_PRIVATE_KEY/);
    vi.stubEnv("LICENSE_PRIVATE_KEY", TEST_D);
    await expect(issueLicense({ userId: crypto.randomUUID(), isSuperAdmin: false }, {})).rejects.toThrow(/réservé/);
    const ctx = await newCompany();
    const row = await issueLicense({ userId: ctx.userId, isSuperAdmin: true }, { installId: "7k2p qx9m", plan: "BASIC", duration: "12", customer: "Boutique Ama" });
    expect(row.installId).toBe(PC);
    expect(verifyLicense(row.code, PC, TEST_X)).toMatchObject({ plan: "BASIC" });
    expect(row.expiresAt!.getTime()).toBeGreaterThan(inDays(360).getTime());
    expect(licenseEnd("life")).toBeNull();
    vi.unstubAllEnvs();
  });
});
