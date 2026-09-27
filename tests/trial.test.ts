import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { can } from "@/lib/permissions";
import { extendTrial, setCompanyPlan } from "@/modules/admin/service";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { computeState } from "@/modules/billing/access";
import { createProduct, listProducts } from "@/modules/products/service";
import { createSale, posBootstrap } from "@/modules/sales/service";
import { newCompany } from "./helpers";

const reload = async (ctx: AppContext) =>
  (await loadContext({ userId: ctx.userId, fullName: ctx.user.fullName, email: ctx.user.email, isSuperAdmin: false }, ctx.companyId))!;

describe("fin de l'essai", () => {
  it("calcule l'état de l'abonnement", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const t = (iso: string) => ({ status: "trialing", trialEndsAt: new Date(iso), planName: "Free" });
    expect(computeState(t("2026-10-13T12:00:00Z"), now)).toMatchObject({ readOnly: false, trialDaysLeft: 3 });
    expect(computeState(t("2026-10-10T11:00:00Z"), now)).toMatchObject({ readOnly: true, trialDaysLeft: null });
    expect(computeState({ status: "active", trialEndsAt: new Date("2020-01-01"), planName: "Basic" }, now).readOnly).toBe(false);
    expect(computeState({ status: "past_due", trialEndsAt: null, planName: "Basic" }, now).readOnly).toBe(true);
    expect(computeState(undefined, now).readOnly).toBe(false);
  });

  it("passe le compte en lecture seule, puis le rouvre avec une formule ou une prolongation", async () => {
    const ctx = await newCompany("Essai terminé");
    const pid = await createProduct(ctx, { name: "Riz", salePrice: 1000, initialStock: 10 });
    const { paymentMethods } = await posBootstrap(ctx);
    const sale = { items: [{ productId: pid, quantity: 1 }], payments: [{ paymentMethodId: paymentMethods[0].id, amount: 1000 }] };
    expect(ctx.subscription.trialDaysLeft).toBe(14);
    const superAdmin = { userId: ctx.userId, isSuperAdmin: true };

    await db.update(subscriptions).set({ trialEndsAt: sql`now() - interval '1 hour'` }).where(eq(subscriptions.companyId, ctx.companyId));
    const expired = await reload(ctx);
    expect(expired.subscription.readOnly).toBe(true);
    expect(can(expired.permissions, "sales.create")).toBe(false);
    expect(can(expired.permissions, "users.manage")).toBe(false);
    expect(can(expired.permissions, "data.export")).toBe(true);
    expect((await listProducts(expired, {})).rows).toHaveLength(1);
    await expect(createSale(expired, sale)).rejects.toThrow(/Permission/);
    await expect(createProduct(expired, { name: "X", salePrice: 1 })).rejects.toThrow(/Permission/);

    await extendTrial(superAdmin, ctx.companyId, 14);
    const extended = await reload(ctx);
    expect(extended.subscription.readOnly).toBe(false);
    expect(extended.subscription.trialDaysLeft).toBe(14);

    await db.update(subscriptions).set({ trialEndsAt: sql`now() - interval '1 hour'` }).where(eq(subscriptions.companyId, ctx.companyId));
    const [basic] = (await db.execute<{ id: string }>(sql`select id from plans where code = 'BASIC'`)).rows;
    await setCompanyPlan(superAdmin, ctx.companyId, basic.id);
    const paid = await reload(ctx);
    expect(paid.subscription).toMatchObject({ readOnly: false, status: "active", planName: "Basic" });
    await createSale(paid, sale);
  });
});
