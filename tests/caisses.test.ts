import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, sales, subscriptions } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { createCustomer } from "@/modules/customers/service";
import { createProduct } from "@/modules/products/service";
import {
  cashierReport,
  closeCashSession,
  createRegister,
  getCashSession,
  listCashSessions,
  listRegisters,
  openCashSession,
  posSessionState,
  updateRegister,
} from "@/modules/registers/service";
import { cancelSale, createSale, listSales, posBootstrap } from "@/modules/sales/service";
import { addMember, listMembers, updateMember } from "@/modules/users/service";
import { newCompany } from "./helpers";

async function member(admin: AppContext, roleName: string, fullName: string): Promise<AppContext> {
  const { roles } = await listMembers(admin);
  const role = roles.find((r) => r.name === roleName)!;
  const email = `c-${randomUUID()}@test.local`;
  const userId = await addMember(admin, { fullName, email, password: "motdepasse123", roleId: role.id });
  const ctx = await loadContext({ userId, fullName, email, isSuperAdmin: false }, admin.companyId);
  if (!ctx) throw new Error("contexte introuvable");
  return ctx;
}

async function setup(name = "Boutique Caisses") {
  const admin = await newCompany(name);
  await db
    .update(subscriptions)
    .set({ planId: sql`(select id from plans where code = 'BUSINESS')` })
    .where(eq(subscriptions.companyId, admin.companyId));
  const pid = await createProduct(admin, { name: "Savon", salePrice: 1500, purchasePrice: 1000, initialStock: 100 });
  const { paymentMethods } = await posBootstrap(admin);
  const cash = paymentMethods.find((p) => p.type === "cash")!;
  const tmoney = paymentMethods.find((p) => p.label === "TMoney")!;
  const r1 = await createRegister(admin, { storeId: admin.storeId });
  const r2 = await createRegister(admin, { storeId: admin.storeId, name: "Caisse express" });
  return { admin, pid, cash, tmoney, r1, r2 };
}

const sell = (ctx: AppContext, pid: string, methodId: string, qty = 1, extra: Record<string, unknown> = {}) =>
  createSale(ctx, { items: [{ productId: pid, quantity: qty }], payments: [{ paymentMethodId: methodId, amount: 1500 * qty }], ...extra });

describe("caisses et sessions de caisse", () => {
  it("numérote les caisses et exige une session ouverte pour vendre", async () => {
    const { admin, pid, cash, r1 } = await setup();
    const regs = await listRegisters(admin);
    expect(regs.map((r) => [r.number, r.name])).toEqual([
      [1, "Caisse 1"],
      [2, "Caisse express"],
    ]);
    // la boutique a des caisses : pas de vente hors session
    await expect(sell(admin, pid, cash.id)).rejects.toThrow(/Ouvrez votre caisse/);
    const state = await posSessionState(admin);
    expect(state.required).toBe(true);
    expect(state.session).toBeNull();

    const sid = await openCashSession(admin, { registerId: r1, openingFloat: "5 000" });
    const s = await sell(admin, pid, cash.id);
    const [row] = await withTenant(admin, (tx) => tx.select().from(sales).where(eq(sales.id, s.id)));
    expect(row.registerId).toBe(r1);
    expect(row.cashSessionId).toBe(sid);
    const [pay] = await withTenant(admin, (tx) => tx.select().from(payments).where(eq(payments.saleId, s.id)));
    expect(pay.cashSessionId).toBe(sid);
    expect((await posSessionState(admin)).session?.registerName).toBe("Caisse 1");
    // une caisse avec une session ouverte ne peut pas être désactivée
    await expect(updateRegister(admin, r1, { isActive: false })).rejects.toThrow(/session ouverte/);
  });

  it("une seule session ouverte par caisse et par caissier", async () => {
    const { admin, r1, r2 } = await setup();
    const ama = await member(admin, "Caissier", "Ama");
    const kofi = await member(admin, "Caissier", "Kofi");
    await openCashSession(ama, { registerId: r1, openingFloat: 0 });
    await expect(openCashSession(kofi, { registerId: r1, openingFloat: 0 })).rejects.toThrow(/déjà ouverte/);
    await expect(openCashSession(ama, { registerId: r2, openingFloat: 0 })).rejects.toThrow(/déjà une session/);
    await openCashSession(kofi, { registerId: r2, openingFloat: 0 });
    const regs = await listRegisters(admin);
    expect(regs.find((r) => r.id === r1)?.openedBy).toBe("Ama");
    // une caisse désactivée ne s'ouvre plus
    const r3 = await createRegister(admin, { storeId: admin.storeId });
    await updateRegister(admin, r3, { isActive: false });
    await expect(openCashSession(admin, { registerId: r3, openingFloat: 0 })).rejects.toThrow(/désactivée/);
  });

  it("clôture : espèces attendues, écart et totaux par moyen de paiement", async () => {
    const { admin, pid, cash, tmoney, r1 } = await setup();
    const ama = await member(admin, "Caissier", "Ama");
    const sid = await openCashSession(ama, { registerId: r1, openingFloat: 10000 });
    await sell(ama, pid, cash.id); // 1 500 espèces
    await sell(ama, pid, cash.id, 2); // 3 000 espèces
    await sell(ama, pid, tmoney.id); // 1 500 TMoney
    const cancelled = await sell(ama, pid, cash.id); // 1 500 espèces, puis annulée (rendue au client)
    await cancelSale(admin, cancelled.id, "erreur");

    const live = await getCashSession(ama, sid);
    expect(live.status).toBe("open");
    expect(live.expectedCash).toBe(14500);

    const res = await closeCashSession(ama, sid, { countedCash: "14 400", notes: "manque 100" });
    expect(res).toMatchObject({ expectedCash: 14500, countedCash: 14400, difference: -100 });
    expect(res.summary).toMatchObject({ salesCount: 3, salesTotal: 6000, cancelledCount: 1, cancelledTotal: 1500, cashIn: 4500 });
    expect(res.summary.byMethod).toEqual(
      expect.arrayContaining([
        { method: "Espèces", type: "cash", count: 2, total: 4500 },
        { method: "TMoney", type: "mobile_money", count: 1, total: 1500 },
      ]),
    );
    const closed = await getCashSession(admin, sid);
    expect(closed).toMatchObject({ status: "closed", forced: false, difference: -100, closedByName: "Ama", closingNotes: "manque 100" });
    await expect(closeCashSession(ama, sid, { countedCash: 0 })).rejects.toThrow(/déjà clôturée/);
    // plus de vente après la clôture tant qu'une nouvelle session n'est pas ouverte
    await expect(sell(ama, pid, cash.id)).rejects.toThrow(/Ouvrez votre caisse/);
    await openCashSession(ama, { registerId: r1, openingFloat: 0 });
    await sell(ama, pid, cash.id);
  });

  it("le caissier ne voit que ses sessions ; le responsable voit tout et force la clôture", async () => {
    const { admin, pid, cash, r1, r2 } = await setup();
    const ama = await member(admin, "Caissier", "Ama");
    const kofi = await member(admin, "Caissier", "Kofi");
    const sa = await openCashSession(ama, { registerId: r1, openingFloat: 1000 });
    const sk = await openCashSession(kofi, { registerId: r2, openingFloat: 2000 });
    await sell(kofi, pid, cash.id);
    await sell(ama, pid, cash.id);

    expect((await listCashSessions(ama)).rows.map((r) => r.id)).toEqual([sa]);
    expect((await listCashSessions(ama, { userId: kofi.userId })).rows.map((r) => r.id)).toEqual([sa]); // filtre ignoré
    await expect(getCashSession(ama, sk)).rejects.toThrow(/introuvable/);
    await expect(closeCashSession(ama, sk, { countedCash: 0 })).rejects.toThrow(/introuvable/);
    // ventes : chacun les siennes, même en filtrant sur un autre caissier
    const seen = await listSales(ama, { userId: kofi.userId });
    expect(seen.rows.map((r) => r.userName)).toEqual(["Ama"]);

    const open = await listCashSessions(admin, { status: "open" });
    expect(open.rows.map((r) => r.id).sort()).toEqual([sa, sk].sort());
    const forced = await closeCashSession(admin, sk, { countedCash: 3500 });
    expect(forced.difference).toBe(0);
    expect((await getCashSession(admin, sk)).forced).toBe(true);
    // le rapport de Kofi montre ses propres chiffres uniquement
    const rep = await cashierReport(ama, { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) }, { userId: kofi.userId });
    expect(rep.byCashier.map((r) => [r.key, r.count])).toEqual([[ama.userId, 1]]);
    expect(rep.byRegister.map((r) => r.key)).toEqual([r1]);
  });

  it("rapport par caissier et par caisse, filtres de la liste des ventes", async () => {
    const { admin, pid, cash, r1, r2 } = await setup();
    const ama = await member(admin, "Caissier", "Ama");
    const client = await createCustomer(admin, { name: "Client crédit" });
    await openCashSession(ama, { registerId: r1, openingFloat: 0 });
    await openCashSession(admin, { registerId: r2, openingFloat: 0 });
    await sell(ama, pid, cash.id); // 1 500
    await sell(ama, pid, cash.id, 3); // 4 500
    const c = await sell(ama, pid, cash.id);
    await cancelSale(admin, c.id, "erreur");
    // admin : une vente avec remise, une à crédit partiel (1 000 payés sur 3 000)
    await createSale(admin, { items: [{ productId: pid, quantity: 1 }], discount: 500, payments: [{ paymentMethodId: cash.id, amount: 1000 }] });
    await createSale(admin, { items: [{ productId: pid, quantity: 2 }], customerId: client, payments: [{ paymentMethodId: cash.id, amount: 1000 }] });

    const range = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) };
    const rep = await cashierReport(admin, range);
    const a = rep.byCashier.find((r) => r.key === ama.userId)!;
    expect(a).toMatchObject({ name: "Ama", count: 2, total: 6000, average: 3000, cancelledCount: 1, cancelledTotal: 1500, discountTotal: 0, creditCount: 0 });
    const b = rep.byCashier.find((r) => r.key === admin.userId)!;
    expect(b).toMatchObject({ count: 2, total: 4000, average: 2000, discountTotal: 500, creditCount: 1, creditTotal: 2000 });
    expect(rep.byRegister.find((r) => r.key === r1)).toMatchObject({ name: "Caisse 1", count: 2, total: 6000 });
    expect(rep.byRegister.find((r) => r.key === r2)).toMatchObject({ name: "Caisse express", count: 2, total: 4000 });
    // filtre par caisse
    const only = await cashierReport(admin, range, { registerId: r2 });
    expect(only.byCashier.map((r) => r.key)).toEqual([admin.userId]);

    expect((await listSales(admin, { registerId: r1 })).total).toBe(3);
    expect((await listSales(admin, { userId: ama.userId })).rows.every((r) => r.userName === "Ama")).toBe(true);
    expect((await listSales(admin, { registerId: r2 })).rows[0].registerName).toBe("Caisse express");

    // les sessions clôturées de la période et leurs écarts
    const [s] = (await listCashSessions(ama, { status: "open" })).rows;
    await closeCashSession(ama, s.id, { countedCash: 5900 });
    const after = await cashierReport(admin, range);
    expect(after.sessions.map((x) => x.difference)).toEqual([-100]);
    expect(after.differenceTotal).toBe(-100);
  });

  it("caisse par défaut d'un membre et isolation entre entreprises", async () => {
    const { admin, r1 } = await setup();
    const other = await newCompany("Autre boutique");
    const ama = await member(admin, "Caissier", "Ama");
    const m = (await listMembers(admin)).members.find((x) => x.userId === ama.userId)!;
    await updateMember(admin, m.id, { registerId: r1 });
    expect((await posSessionState(ama)).defaultRegisterId).toBe(r1);
    const sid = await openCashSession(ama, { registerId: r1, openingFloat: 0 });

    // l'autre entreprise ne voit ni les caisses ni les sessions, et ne peut pas les utiliser
    expect(await listRegisters(other)).toEqual([]);
    expect((await listCashSessions(other)).total).toBe(0);
    await expect(getCashSession(other, sid)).rejects.toThrow(/introuvable/);
    await expect(openCashSession(other, { registerId: r1, openingFloat: 0 })).rejects.toThrow(/introuvable/);
    await expect(closeCashSession(other, sid, { countedCash: 0 })).rejects.toThrow(/introuvable/);
    await expect(createRegister(other, { storeId: admin.storeId })).rejects.toThrow(/introuvable/);
    await expect(updateMember(other, m.id, { registerId: r1 })).rejects.toThrow(/introuvable/);
    const { members } = await listMembers(other);
    await expect(updateMember(admin, m.id, { registerId: (await listRegisters(admin))[0].id })).resolves.toBeUndefined();
    expect(members.length).toBe(1);
    // l'autre entreprise, sans caisse, vend toujours sans session
    expect((await posSessionState(other)).required).toBe(false);
  });

  it("le caissier ne gère pas les caisses", async () => {
    const { admin } = await setup();
    const ama = await member(admin, "Caissier", "Ama");
    await expect(createRegister(ama, { storeId: admin.storeId })).rejects.toThrow(/Permission/);
    const gerant = await member(admin, "Gérant", "Gérant");
    expect(gerant.permissions).toContain("registers.manage");
  });
});
