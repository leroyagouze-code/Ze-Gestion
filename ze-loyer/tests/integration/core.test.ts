/*
 * Tests d'intégration (PostgreSQL) : isolation des données, permissions, paiements, quittances, audit, invitations.
 * La base TEST_DATABASE_URL est vidée au début.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { auditLogs, memberships, notifications, payments, users } from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getScopedLease, getTenantLease } from "@/modules/access";
import { loadStaffContext, type StaffCtx } from "@/modules/auth/context";
import { login, signup } from "@/modules/auth/service";
import { createDispute, listDisputes } from "@/modules/disputes/service";
import { cancelPayment, getReceipt, loadLedgers, recordPayment } from "@/modules/finance/service";
import { acceptInvitation, inviteOwner, inviteTenant } from "@/modules/invitations/service";
import { createProperty, createUnit, listProperties } from "@/modules/properties/service";
import { createLease, createOwner, createTenant, listTenantsWithSituation } from "@/modules/tenants/service";

const TODAY = "2026-10-10";
const meta = { ip: "127.0.0.1", userAgent: "vitest" };
let n = 0;
const phone = () => `9${String(3000000 + ++n).padStart(7, "0")}`;

async function staff(userId: string, orgId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return (await loadStaffContext({ userId, fullName: u.fullName }, orgId, null)) as StaffCtx;
}

async function addMember(ctx: StaffCtx, role: "ACCOUNTANT" | "FIELD_AGENT") {
  const s = await signup({ fullName: `Membre ${role}`, phone: phone(), password: "motdepasse1", accountType: "TENANT" }, meta);
  await db.insert(memberships).values({ organizationId: ctx.orgId, userId: s.userId, role });
  return staff(s.userId, ctx.orgId);
}

/** Agence avec 2 propriétaires, un logement chacun, un bail chacun */
async function agencyFixture(name: string) {
  const s = await signup({ fullName: `Admin ${name}`, phone: phone(), password: "motdepasse1", accountType: "AGENCY", organizationName: name }, meta);
  const ctx = await staff(s.userId, s.orgId!);
  const ownerA = await createOwner(ctx, { fullName: `Owner A ${name}`, phone: phone() });
  const ownerB = await createOwner(ctx, { fullName: `Owner B ${name}`, phone: phone() });
  const pA = await createProperty(ctx, { name: `Immeuble A ${name}`, city: "Lomé", ownerId: ownerA.id });
  const pB = await createProperty(ctx, { name: `Immeuble B ${name}`, city: "Lomé", ownerId: ownerB.id });
  const uA = await createUnit(ctx, { propertyId: pA.id, label: "A03", type: "APPARTEMENT", rentAmount: "75 000", dueDay: 5 });
  const uB = await createUnit(ctx, { propertyId: pB.id, label: "B02", type: "APPARTEMENT", rentAmount: 75000, dueDay: 5 });
  const tA = await createTenant(ctx, { fullName: "Kossi Mensah", phone: phone() });
  const tB = await createTenant(ctx, { fullName: "Ama Doe", phone: phone() });
  const leaseA = await createLease(ctx, { tenantId: tA.tenant.id, unitId: uA.id, startDate: "2026-08-01" }, TODAY);
  const leaseB = await createLease(ctx, { tenantId: tB.tenant.id, unitId: uB.id, startDate: "2026-08-01" }, TODAY);
  return { ctx, ownerA, ownerB, tenantA: tA.tenant, tenantB: tB.tenant, leaseA, leaseB, pA, pB };
}

let A: Awaited<ReturnType<typeof agencyFixture>>;
let B: Awaited<ReturnType<typeof agencyFixture>>;

beforeAll(async () => {
  await db.execute(sql`truncate table audit_logs, notifications, invitations, requests, disputes, documents, receipts, receipt_sequences, deposits, payment_allocations, payments, rent_charges, leases, tenants, units, properties, memberships, owners, sessions, login_attempts, organizations, users cascade`);
  A = await agencyFixture("Agence A");
  B = await agencyFixture("Agence B");
});

afterAll(async () => {
  await pool.end();
});

describe("Isolation des organisations", () => {
  it("une agence ne voit pas les locations d'une autre", async () => {
    await expect(getScopedLease(B.ctx, A.leaseA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordPayment(B.ctx, { leaseId: A.leaseA.id, type: "LOYER", amount: 75000, method: "CASH", paidAt: TODAY }, TODAY)).rejects.toBeInstanceOf(NotFoundError);
    const tenantsB = await listTenantsWithSituation(B.ctx);
    expect(tenantsB.map((t) => t.tenant.organizationId).every((o) => o === B.ctx.orgId)).toBe(true);
  });

  it("un propriétaire suivi par l'agence ne voit que ses biens", async () => {
    const inv = await inviteOwner(A.ctx, A.ownerA.id);
    const token = inv.url.split("/invitation/")[1];
    const res = await acceptInvitation(token, { currentUserId: null, password: "motdepasse1" }, meta);
    expect(res.kind).toBe("OWNER");
    const [owner] = await db.select().from(users).innerJoin(memberships, eq(memberships.userId, users.id)).where(eq(memberships.ownerId, A.ownerA.id));
    const ownerCtx = await staff(owner.users.id, A.ctx.orgId);
    expect(ownerCtx.role).toBe("OWNER");
    const props = await listProperties(ownerCtx);
    expect(props.map((p) => p.property.id)).toEqual([A.pA.id]);
    await expect(getScopedLease(ownerCtx, A.leaseB.id)).rejects.toBeInstanceOf(NotFoundError);
    // Consultation seulement
    await expect(recordPayment(ownerCtx, { leaseId: A.leaseA.id, type: "LOYER", amount: 75000, method: "CASH", paidAt: TODAY }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    const visible = await listTenantsWithSituation(ownerCtx);
    expect(visible.map((t) => t.tenant.id)).toEqual([A.tenantA.id]);
  });
});

describe("Permissions par rôle (côté serveur)", () => {
  it("un comptable ne peut pas créer de bien", async () => {
    const acc = await addMember(A.ctx, "ACCOUNTANT");
    await expect(createProperty(acc, { name: "X", city: "Lomé", ownerId: A.ownerA.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un agent terrain encaisse mais ne peut pas annuler", async () => {
    const agent = await addMember(A.ctx, "FIELD_AGENT");
    const { paymentId } = await recordPayment(agent, { leaseId: A.leaseB.id, type: "LOYER", amount: 75000, method: "TMONEY", paidAt: "2026-08-05", reference: "TX1" }, TODAY);
    await expect(cancelPayment(agent, paymentId, "erreur de saisie", TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Paiements, quittances et audit", () => {
  it("répartit une avance, génère la quittance numérotée et trace l'action", async () => {
    // Août + septembre + octobre appelés (225 000) ; 450 000 couvre jusqu'à janvier 2027
    const { paymentId, receiptId, situation } = await recordPayment(A.ctx, { leaseId: A.leaseA.id, type: "AVANCE", amount: "450 000", method: "CASH", paidAt: "2026-10-02" }, TODAY);
    expect(situation.status).toBe("EN_AVANCE");
    expect(situation.coveredUntil).toBe("2027-01-31");
    expect(situation.advance).toBe(225000);
    const r = await getReceipt({ kind: "staff", ctx: A.ctx }, receiptId!);
    expect(r.number).toMatch(/^ZL-2026-\d{6}$/);
    expect(r.periodLabel).toBe("Août 2026 → Janvier 2027");
    expect(r.snapshot.lines).toHaveLength(6);
    expect(r.snapshot.status).toBe("PAYÉ");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, paymentId));
    expect(logs[0].summary).toContain("450");
    // Une autre agence ne peut pas lire la quittance
    await expect(getReceipt({ kind: "staff", ctx: B.ctx }, receiptId!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("paiement partiel : statut PARTIEL sur la quittance", async () => {
    const { receiptId, situation } = await recordPayment(B.ctx, { leaseId: B.leaseA.id, type: "LOYER", amount: 50000, method: "FLOOZ", paidAt: "2026-08-05" }, TODAY);
    const r = await getReceipt({ kind: "staff", ctx: B.ctx }, receiptId!);
    expect(r.snapshot.status).toBe("PARTIEL");
    expect(situation.lines[0].remaining).toBe(25000);
    expect(situation.status).toBe("EN_RETARD");
  });

  it("annuler un paiement : jamais supprimé, solde recalculé, raison tracée", async () => {
    const { paymentId } = await recordPayment(B.ctx, { leaseId: B.leaseB.id, type: "LOYER", amount: 75000, method: "CASH", paidAt: "2026-08-04" }, TODAY);
    const before = (await loadLedgers(db, [B.leaseB], TODAY)).get(B.leaseB.id)!;
    await cancelPayment(B.ctx, paymentId, "Montant saisi deux fois", TODAY);
    const after = (await loadLedgers(db, [B.leaseB], TODAY)).get(B.leaseB.id)!;
    expect(after.balance - before.balance).toBe(75000);
    const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(p.status).toBe("CANCELLED");
    expect(p.cancelReason).toBe("Montant saisi deux fois");
    await expect(cancelPayment(B.ctx, paymentId, "encore", TODAY)).rejects.toThrow("déjà annulé");
    await expect(db.delete(payments).where(eq(payments.id, paymentId))).rejects.toThrow();
  });

  it("le journal d'audit est en ajout seul", async () => {
    await expect(db.update(auditLogs).set({ summary: "falsifié" })).rejects.toThrow();
    await expect(db.delete(auditLogs)).rejects.toThrow();
  });

  it("refuse un paiement daté dans le futur", async () => {
    await expect(recordPayment(A.ctx, { leaseId: A.leaseB.id, type: "LOYER", amount: 75000, method: "CASH", paidAt: "2026-12-01" }, TODAY)).rejects.toThrow("futur");
  });
});

describe("Invitation et espace locataire", () => {
  it("le locataire invité rejoint son logement et ne voit que lui", async () => {
    const inv = await inviteTenant(A.ctx, A.tenantA.id);
    const token = inv.url.split("/invitation/")[1];
    const res = await acceptInvitation(token, { currentUserId: null, password: "motdepasse1" }, meta);
    expect(res.kind).toBe("TENANT");
    expect(res.organizationId).toBeNull();
    await expect(acceptInvitation(token, { currentUserId: null, password: "motdepasse1" }, meta)).rejects.toThrow();

    const [u] = await db.select().from(users).where(eq(users.phone, A.tenantA.phone));
    const { current, all } = await getTenantLease(u.id, undefined);
    expect(current?.lease.id).toBe(A.leaseA.id);
    expect(all).toHaveLength(1);
    await expect(getTenantLease(u.id, A.leaseB.id)).rejects.toBeInstanceOf(NotFoundError);

    // Contestation : trace conservée et gestionnaires notifiés
    await createDispute({ kind: "tenant", userId: u.id, userName: "Kossi", phone: A.tenantA.phone, ip: null }, { leaseId: A.leaseA.id, amount: "75000", comment: "Paiement du 05/09 absent" }, null);
    const d = await listDisputes(A.ctx, "OPEN");
    expect(d).toHaveLength(1);
    expect(await listDisputes(B.ctx, "OPEN")).toHaveLength(0);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, A.ctx.userId));
    expect(notes.some((x) => x.title === "Nouvelle contestation")).toBe(true);
    // Un autre locataire ne peut pas contester cette location
    await expect(
      createDispute({ kind: "tenant", userId: A.ctx.userId, userName: "x", phone: "x", ip: null }, { leaseId: A.leaseA.id, comment: "test" }, null),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Connexion", () => {
  it("bloque après 5 échecs", async () => {
    const p = phone();
    await signup({ fullName: "Test Login", phone: p, password: "motdepasse1", accountType: "OWNER" }, meta);
    const m = { ip: "10.0.0.9", userAgent: null };
    for (let i = 0; i < 5; i++) await expect(login({ identifier: p, password: "mauvais" }, m)).rejects.toThrow("incorrect");
    await expect(login({ identifier: p, password: "motdepasse1" }, m)).rejects.toThrow("Trop de tentatives");
    const ok = await login({ identifier: p, password: "motdepasse1" }, { ip: "10.0.0.10", userAgent: null }).catch((e) => e);
    expect(ok).toBeInstanceOf(Error); // identifiant toujours bloqué, quelle que soit l'IP
  });
});
