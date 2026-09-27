import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { licenseOrders, subscriptions } from "@/db/schema";
import { newCompany } from "./helpers";

// Paire de clés de test : la vraie clé privée ne quitte jamais le serveur de ZE GROUP.
const jwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const TEST_X = jwk.x!;

vi.mock("@/lib/license", async (orig) => {
  const real = await orig<typeof import("@/lib/license")>();
  return { ...real, verifyLicense: (code: string, id: string) => real.verifyLicense(code, id, TEST_X) };
});

const { verifyLicense } = await import("@/lib/license");
const { createOrder, latestLicenseFor, publicOrder, refreshOrder, simulatePayment, savePrice, listPrices } = await import("@/modules/billing/license-orders");
const { fetchLicenseFromServer } = await import("@/modules/billing/license");

// Code d'installation différent à chaque test (la limite de 5 commandes par heure est par poste)
const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const newPc = () => {
  const s = Array.from(randomBytes(8), (b) => A[b & 31]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
};
const order = (pc: string, extra: Record<string, string> = {}) => ({
  installId: pc,
  offer: "PRO:12",
  customerName: "Boutique Test",
  phone: "+228 90 12 34 56",
  network: "TMONEY",
  ...extra,
});

beforeAll(() => {
  vi.stubEnv("LICENSE_PRIVATE_KEY", jwk.d!);
  vi.stubEnv("PAYMENT_MODE", "simulation");
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe("achat de licence en ligne", () => {
  it("mode test : la clé est créée au paiement, pour ce poste seulement, une seule fois", async () => {
    const pc = newPc();
    const ref = await createOrder(order(pc));
    expect(ref).toMatch(/^ZL[0-9A-Z]{8}$/);
    let o = await publicOrder(ref);
    expect(o).toMatchObject({ status: "pending", code: null, amount: 150000, phone: "90123456", provider: "simulation" });
    expect(await latestLicenseFor(pc)).toBeNull();

    await simulatePayment(ref, "paid");
    o = await publicOrder(ref);
    expect(o.status).toBe("paid");
    expect(verifyLicense(o.code!, pc)).toMatchObject({ plan: "PRO" });
    expect(verifyLicense(o.code!, newPc())).toBeNull();
    expect((await latestLicenseFor(pc.toLowerCase()))?.code).toBe(o.code);

    // Un second « paiement réussi » ne recrée pas de clé
    await simulatePayment(ref, "paid");
    expect((await publicOrder(ref)).code).toBe(o.code);
  });

  it("paiement refusé : pas de clé", async () => {
    const pc = newPc();
    const ref = await createOrder(order(pc, { network: "FLOOZ" }));
    await simulatePayment(ref, "failed");
    expect(await publicOrder(ref)).toMatchObject({ status: "failed", code: null });
    expect(await latestLicenseFor(pc)).toBeNull();
  });

  it("refuse une formule retirée de la vente, un code ou un numéro mal saisi, et les abus", async () => {
    await expect(createOrder(order("12"))).rejects.toThrow();
    await expect(createOrder(order(newPc(), { phone: "123" }))).rejects.toThrow();
    await savePrice({ userId: crypto.randomUUID(), isSuperAdmin: true }, { plan: "BASIC", duration: "1", amount: "5000", isActive: false });
    await expect(createOrder(order(newPc(), { offer: "BASIC:1" }))).rejects.toThrow(/plus proposée/);
    await savePrice({ userId: crypto.randomUUID(), isSuperAdmin: true }, { plan: "BASIC", duration: "1", amount: "5000", isActive: "on" });
    expect((await listPrices({ activeOnly: true })).some((p) => p.plan === "BASIC" && p.duration === "1")).toBe(true);
    const pc = newPc();
    for (let i = 0; i < 5; i++) await createOrder(order(pc));
    await expect(createOrder(order(pc))).rejects.toThrow(/Trop de tentatives/);
  });

  it("vente fermée en production sans service de paiement", async () => {
    vi.stubEnv("PAYMENT_MODE", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(createOrder(order(newPc()))).rejects.toThrow(/pas encore ouverte/);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_MODE", "simulation");
  });

  it("PayGate : demande envoyée au téléphone, puis statut vérifié auprès de PayGate avant de livrer", async () => {
    vi.stubEnv("PAYMENT_MODE", "");
    vi.stubEnv("PAYGATE_API_KEY", "cle-test");
    let paid = false;
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url.endsWith("/api/v1/pay")) return Response.json({ tx_reference: "TX1", status: 0 });
      return Response.json(paid ? { status: 0, payment_reference: "TM123", payment_method: "T-Money" } : { status: 2 });
    });
    try {
      const pc = newPc();
      const ref = await createOrder(order(pc));
      expect(calls[0].body).toMatchObject({ auth_token: "cle-test", phone_number: "90123456", amount: 150000, identifier: ref, network: "TMONEY" });
      expect(await refreshOrder(ref, { force: true })).toMatchObject({ status: "pending", providerRef: "TX1" });
      paid = true;
      const o = await refreshOrder(ref, { force: true });
      expect(o).toMatchObject({ status: "paid", paymentRef: "TM123" });
      expect(calls.at(-1)).toMatchObject({ body: { identifier: ref } });
      // La simulation est refusée quand PayGate est actif
      await expect(simulatePayment(ref, "paid")).rejects.toThrow(/Simulation/);
    } finally {
      vi.stubEnv("PAYGATE_API_KEY", "");
      vi.stubEnv("PAYMENT_MODE", "simulation");
    }
  });

  it("PayGate refuse la demande : commande échouée avec la raison", async () => {
    vi.stubEnv("PAYMENT_MODE", "");
    vi.stubEnv("PAYGATE_API_KEY", "mauvaise");
    vi.stubGlobal("fetch", async () => Response.json({ status: 2 }));
    try {
      const ref = await createOrder(order(newPc()));
      const [o] = await db.select().from(licenseOrders).where(eq(licenseOrders.reference, ref));
      expect(o).toMatchObject({ status: "failed", failureReason: expect.stringMatching(/Clé PayGate/) });
    } finally {
      vi.stubEnv("PAYGATE_API_KEY", "");
      vi.stubEnv("PAYMENT_MODE", "simulation");
    }
  });
});

describe("logiciel : activation automatique après l'achat", () => {
  it("récupère la licence payée sur le serveur et l'active", async () => {
    const pc = newPc();
    const ref = await createOrder(order(pc, { offer: "BUSINESS:life" }));
    await simulatePayment(ref, "paid");
    const { code } = (await publicOrder(ref)) as { code: string };

    vi.stubEnv("ZE_EDITION", "desktop");
    vi.stubEnv("ZE_INSTALL_ID", pc);
    vi.stubEnv("ZE_SERVER_URL", "https://serveur.test/");
    vi.stubGlobal("fetch", async (url: string) => {
      expect(url).toBe(`https://serveur.test/api/licences/poste/${pc}`);
      const l = await latestLicenseFor(pc);
      return l ? Response.json({ license: l }) : Response.json({ license: null }, { status: 404 });
    });
    try {
      const ctx = await newCompany();
      const r = await fetchLicenseFromServer(ctx.companyId, null);
      expect(r).toMatchObject({ plan: "BUSINESS", expiresAt: null });
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, ctx.companyId));
      expect(sub).toMatchObject({ status: "active", unlimited: true, licenseCode: code.replace(/-/g, "") });
      expect(await fetchLicenseFromServer(ctx.companyId, null)).toBe("same");
    } finally {
      vi.stubEnv("ZE_EDITION", "");
      vi.stubEnv("ZE_SERVER_URL", "");
    }
  });
});
