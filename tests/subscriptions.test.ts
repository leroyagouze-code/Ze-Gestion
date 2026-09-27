import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPayments, subscriptions } from "@/db/schema";
import { can } from "@/lib/permissions";
import {
  extendTrial,
  getCompanyAdmin,
  listCompanies,
  platformOverview,
  recordSubscriptionPayment,
  setCompanyPlan,
  setUnlimited,
} from "@/modules/admin/service";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { computeState } from "@/modules/billing/access";
import { addMember, listMembers } from "@/modules/users/service";
import { newCompany } from "./helpers";

const reload = async (ctx: AppContext) =>
  (await loadContext({ userId: ctx.userId, fullName: ctx.user.fullName, email: ctx.user.email, isSuperAdmin: false }, ctx.companyId))!;
const planId = async (code: string) => (await db.execute<{ id: string }>(sql`select id from plans where code = ${code}`)).rows[0].id;
const sub = async (companyId: string) => (await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)))[0];
const DAY = 86_400_000;

describe("abonnements (super admin)", () => {
  it("calcule l'état d'une période payée et d'un accès offert", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const active = (end: string) => ({ status: "active", trialEndsAt: null, planName: "Pro", currentPeriodEnd: new Date(end) });
    expect(computeState(active("2026-10-15T12:00:00Z"), now)).toMatchObject({ readOnly: false, expired: false, periodDaysLeft: 5 });
    expect(computeState(active("2026-10-10T11:00:00Z"), now)).toMatchObject({ readOnly: true, expired: true });
    expect(computeState({ ...active("2020-01-01"), unlimited: true }, now)).toMatchObject({ readOnly: false, unlimited: true });
    expect(computeState({ status: "past_due", trialEndsAt: null, planName: "Pro", unlimited: true }, now).readOnly).toBe(false);
  });

  it("refuse tout à un utilisateur qui n'est pas super admin", async () => {
    const ctx = await newCompany("Pas admin");
    const u = { userId: ctx.userId, isSuperAdmin: false };
    await expect(platformOverview(u)).rejects.toThrow(/réservé/);
    await expect(recordSubscriptionPayment(u, ctx.companyId, { planId: await planId("PRO"), months: 1, amount: 1, method: "cash" })).rejects.toThrow(/réservé/);
    await expect(setUnlimited(u, ctx.companyId, true)).rejects.toThrow(/réservé/);
  });

  it("enregistre un paiement, prolonge la période en cours et garde l'historique", async () => {
    const ctx = await newCompany("Client payant");
    const admin = { userId: ctx.userId, isSuperAdmin: true };
    const pro = await planId("PRO");

    const end1 = await recordSubscriptionPayment(admin, ctx.companyId, { planId: pro, months: 1, amount: 15000, method: "flooz", reference: "FLZ-1" });
    expect(end1.getTime() - Date.now()).toBeGreaterThan(27 * DAY);
    const end2 = await recordSubscriptionPayment(admin, ctx.companyId, { planId: pro, months: 2, amount: 30000, method: "cash" });
    // La deuxième période commence à la fin de la première, pas aujourd'hui
    expect(end2.getTime() - end1.getTime()).toBeGreaterThan(58 * DAY);
    expect(await sub(ctx.companyId)).toMatchObject({ status: "active", unlimited: false, planId: pro });

    const d = await getCompanyAdmin(admin, ctx.companyId);
    expect(d.payments).toHaveLength(2);
    expect(d.payments[0].payment).toMatchObject({ amount: 30000, method: "cash", months: 2 });
    expect(d.state).toMatchObject({ readOnly: false, planName: "Pro" });

    await expect(recordSubscriptionPayment(admin, ctx.companyId, { planId: pro, months: 0, amount: 1, method: "cash" })).rejects.toThrow();
    await expect(recordSubscriptionPayment(admin, ctx.companyId, { planId: pro, months: 1, amount: 1, method: "bitcoin" })).rejects.toThrow();
    // Accès actif : pas de prolongation d'essai
    await expect(extendTrial(admin, ctx.companyId)).rejects.toThrow(/déjà un accès/);
  });

  it("met en lecture seule quand la période payée est dépassée", async () => {
    const ctx = await newCompany("Client expiré");
    const admin = { userId: ctx.userId, isSuperAdmin: true };
    await recordSubscriptionPayment(admin, ctx.companyId, { planId: await planId("BASIC"), months: 1, amount: 5000, method: "tmoney" });
    await db.update(subscriptions).set({ currentPeriodEnd: sql`now() - interval '1 hour'` }).where(eq(subscriptions.companyId, ctx.companyId));
    const expired = await reload(ctx);
    expect(expired.subscription).toMatchObject({ readOnly: true, expired: true });
    expect(can(expired.permissions, "sales.create")).toBe(false);

    // Un nouveau paiement repart d'aujourd'hui
    const end = await recordSubscriptionPayment(admin, ctx.companyId, { planId: await planId("BASIC"), months: 1, amount: 5000, method: "tmoney" });
    expect(end.getTime() - Date.now()).toBeLessThan(32 * DAY);
    expect((await reload(ctx)).subscription.readOnly).toBe(false);
  });

  it("offre un accès illimité sans échéance ni limite d'utilisateurs, puis le retire", async () => {
    const ctx = await newCompany("Partenaire");
    const admin = { userId: ctx.userId, isSuperAdmin: true };
    await setCompanyPlan(admin, ctx.companyId, await planId("FREE"));
    const cashier = (await listMembers(ctx)).roles.find((r) => r.name === "Caissier")!;
    const member = (n: number) => ({ fullName: `Membre ${n}`, email: `m${n}-${ctx.companyId}@test.local`, password: "motdepasse123", roleId: cashier.id });
    await db.update(subscriptions).set({ trialEndsAt: sql`now() - interval '1 hour'` }).where(eq(subscriptions.companyId, ctx.companyId));
    expect((await reload(ctx)).subscription.readOnly).toBe(true);

    await setUnlimited(admin, ctx.companyId, true, "Partenaire ZE GROUP");
    const free = await reload(ctx);
    expect(free.subscription).toMatchObject({ readOnly: false, unlimited: true });
    expect(can(free.permissions, "sales.create")).toBe(true);
    expect((await sub(ctx.companyId)).notes).toBe("Partenaire ZE GROUP");
    // La formule FREE limite à 1 utilisateur, mais l'accès illimité lève la limite
    await addMember(free, member(1));

    const list = await listCompanies(admin, { filter: "unlimited", q: "Partenaire" });
    expect(list.rows.map((r) => r.id)).toContain(ctx.companyId);

    await setUnlimited(admin, ctx.companyId, false);
    const after = await reload(ctx);
    expect(after.subscription).toMatchObject({ unlimited: false, readOnly: true });
    await expect(addMember(after, member(2))).rejects.toThrow();
    expect(await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.companyId, ctx.companyId))).toHaveLength(0);
  });
});
