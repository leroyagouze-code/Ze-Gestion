/*
 * Données de démonstration ZE LOYER (dates relatives à aujourd'hui, pour rester parlantes).
 *
 *   Agence ZE IMMOBILIER : 8 propriétaires · 14 immeubles · 126 logements (109 occupés · 12 vacants · 5 réservés)
 *   Propriétaire Leroy Agouze : 3 immeubles · 12 logements (accès consultation)
 *   Locataire Kossi Mensah : Appartement A03 · 75 000 FCFA · à jour
 *   + situations : en retard, paiement partiel, en avance, logement vacant.
 *
 * ⚠️ Efface toutes les données de la base. Refusé en production sauf SEED_FORCE=1.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { disputes, leases, memberships, organizations, owners, requests, tenants, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loadStaffContext, type StaffCtx } from "@/modules/auth/context";
import { addDays, addMonths, dayOfMonth, parseISO, todayISO } from "@/modules/finance/dates";
import { scheduleUntil } from "@/modules/finance/ledger";
import { recordPayment } from "@/modules/finance/service";
import { createProperty, createUnit, setUnitReserved } from "@/modules/properties/service";
import { createLease, createOwner, createTenant } from "@/modules/tenants/service";

const PASSWORD = "zeloyer2026";
const TODAY = todayISO();

// Générateur pseudo-aléatoire déterministe (démo reproductible)
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];

const FIRST = ["Kodjo", "Afi", "Komlan", "Akossiwa", "Yao", "Abla", "Kossi", "Ama", "Edem", "Enyonam", "Koffi", "Adjoa", "Mawuli", "Dzifa", "Sena", "Elom", "Kafui", "Esso", "Pidalo", "Essowè", "Tchilabalo", "Yawa", "Kokou", "Mawuena", "Akouvi", "Folly", "Délali", "Selom"];
const LAST = ["Mensah", "Agbeko", "Adjovi", "Lawson", "Amegah", "Tchalla", "Kpodar", "d'Almeida", "Akakpo", "Gbadoe", "Assogba", "Kodjovi", "Ayité", "Dogbé", "Houngbo", "Klutse", "Sossou", "Tossou", "Bawa", "Essohana", "Wiyao", "Kondo", "Gnassingbé", "Ekoué"];
const DISTRICTS = ["Tokoin", "Bè", "Adidogomé", "Agoè", "Nyékonakpoè", "Hédzranawoé", "Djidjolé", "Kégué", "Baguida", "Adakpamé", "Avédji"];

type Scenario = "UP_TO_DATE" | "LATE" | "PARTIAL_LATE" | "PARTIAL_CURRENT" | "AHEAD" | "UNPAID_CURRENT";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") throw new Error("Seed refusé en production (SEED_FORCE=1 pour forcer).");
  console.log(`Remise à zéro… (aujourd'hui : ${TODAY})`);
  await db.execute(sql`truncate table audit_logs, notifications, invitations, requests, disputes, documents, receipts, receipt_sequences, deposits, payment_allocations, payments, rent_charges, leases, tenants, units, properties, memberships, owners, sessions, login_attempts, organizations, users restart identity cascade`);

  const passwordHash = await hashPassword(PASSWORD);
  const mkUser = async (fullName: string, phone: string, email?: string) =>
    (await db.insert(users).values({ fullName, phone, email: email ?? null, passwordHash }).returning())[0];

  /* ── Agence et comptes ── */
  const admin = await mkUser("Admin Agence", "+22890000001", "agence@zeloyer.demo");
  const [org] = await db
    .insert(organizations)
    .values({ name: "ZE IMMOBILIER", kind: "AGENCY", plan: "AGENCE", phone: "+22890000001", email: "contact@zeimmobilier.demo", address: "Boulevard du 13 Janvier", city: "Lomé" })
    .returning();
  await db.insert(memberships).values({ organizationId: org.id, userId: admin.id, role: "ADMIN" });
  const accountant = await mkUser("Afi Comptable", "+22890000006");
  await db.insert(memberships).values({ organizationId: org.id, userId: accountant.id, role: "ACCOUNTANT" });

  const ctx = (await loadStaffContext({ userId: admin.id, fullName: admin.fullName }, org.id, null)) as StaffCtx;

  /* ── 8 propriétaires ── */
  const leroy = await createOwner(ctx, { fullName: "Leroy Agouze", phone: "90000002", email: "leroy@zeloyer.demo" });
  const others = [];
  for (const name of ["Afi Kpodar", "Komlan Adjovi", "Edem Lawson", "Yawa Amegah", "Kodjo Tchalla", "Akouvi Mensah", "Sena d'Almeida"])
    others.push(await createOwner(ctx, { fullName: name, phone: `9${String(1000000 + others.length * 13).slice(0, 7)}` }));
  const leroyUser = await mkUser("Leroy Agouze", "+22890000002", "leroy@zeloyer.demo");
  await db.update(owners).set({ userId: leroyUser.id }).where(eq(owners.id, leroy.id));
  await db.insert(memberships).values({ organizationId: org.id, userId: leroyUser.id, role: "OWNER", ownerId: leroy.id });

  /* ── 14 immeubles / 126 logements ── */
  type U = { id: string; label: string; rent: number; propertyName: string };
  const allUnits: U[] = [];
  const addBuilding = async (ownerId: string, name: string, district: string, labels: string[], type: "APPARTEMENT" | "STUDIO" | "CHAMBRE" | "MAISON" | "BOUTIQUE", rent: (i: number) => number) => {
    const p = await createProperty(ctx, { name, city: "Lomé", district, address: `Quartier ${district}`, ownerId });
    for (let i = 0; i < labels.length; i++) {
      const r = rent(i);
      const u = await createUnit(ctx, { propertyId: p.id, label: labels[i], type, rentAmount: r, dueDay: 5, depositAmount: r * 2 });
      allUnits.push({ id: u.id, label: u.label, rent: r, propertyName: name });
    }
  };

  // Leroy : 3 immeubles, 12 logements
  await addBuilding(leroy.id, "Résidence Tokoin", "Tokoin", ["A01", "A02", "A03", "A04", "B01", "B02"], "APPARTEMENT", () => 75000);
  await addBuilding(leroy.id, "Villa Bè", "Bè", ["V1", "V2", "V3"], "MAISON", (i) => [150000, 120000, 120000][i]);
  await addBuilding(leroy.id, "Cour Adidogomé", "Adidogomé", ["Ch1", "Ch2", "Ch3"], "CHAMBRE", () => 25000);

  // 11 autres immeubles : 114 logements
  const sizes = [14, 12, 10, 10, 12, 8, 10, 12, 8, 9, 9];
  const names = ["Immeuble Djidjolé", "Résidence Agoè", "Les Palmiers", "Résidence Kégué", "Immeuble Nyékonakpoè", "Villa Baguida", "Résidence Hédzranawoé", "Immeuble Avédji", "Cité Adakpamé", "Les Cocotiers", "Galerie Déckon"];
  for (let b = 0; b < sizes.length; b++) {
    const owner = others[b % others.length];
    const labels = Array.from({ length: sizes[b] }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 6))}${String((i % 6) + 1).padStart(2, "0")}`);
    const isShop = b === 10;
    const base = pick([35000, 45000, 50000, 60000, 65000, 80000, 90000]);
    await addBuilding(owner.id, names[b], DISTRICTS[b % DISTRICTS.length], labels, isShop ? "BOUTIQUE" : pick(["APPARTEMENT", "STUDIO", "APPARTEMENT"] as const), (i) => base + (i % 3) * 5000);
  }
  console.log(`${allUnits.length} logements créés.`);

  /* ── Locations et paiements ── */
  const byLabel = (property: string, label: string) => allUnits.find((u) => u.propertyName === property && u.label === label)!;
  const special = new Map<string, { name: string; phone: string; scenario: Scenario; months: number; account?: string; dueDay?: number }>([
    [byLabel("Résidence Tokoin", "A03").id, { name: "Kossi Mensah", phone: "+22890000003", scenario: "UP_TO_DATE", months: 8, account: "Kossi Mensah" }],
    [byLabel("Résidence Tokoin", "B02").id, { name: "Ama Doe", phone: "+22890000004", scenario: "LATE", months: 6, account: "Ama Doe" }],
    [byLabel("Résidence Tokoin", "A01").id, { name: "Yao Agbeko", phone: "+22890000005", scenario: "AHEAD", months: 5, account: "Yao Agbeko" }],
    [byLabel("Résidence Tokoin", "A02").id, { name: "Enyonam Klutse", phone: "+22891111102", scenario: "PARTIAL_CURRENT", months: 4, dueDay: Math.min(28, parseISO(TODAY).d + 3) }],
    [byLabel("Villa Bè", "V1").id, { name: "Kofi Ayité", phone: "+22891111103", scenario: "PARTIAL_LATE", months: 7, dueDay: Math.max(1, parseISO(TODAY).d - 3) }],
    [byLabel("Villa Bè", "V2").id, { name: "Selom Dogbé", phone: "+22891111104", scenario: "UP_TO_DATE", months: 12 }],
    [byLabel("Cour Adidogomé", "Ch1").id, { name: "Esso Bawa", phone: "+22891111105", scenario: "UNPAID_CURRENT", months: 3 }],
  ]);
  // Chez Leroy : A04, B01, Ch3 vacants, V3 + Ch2 occupés à jour
  const leroyVacant = new Set([byLabel("Résidence Tokoin", "A04").id, byLabel("Résidence Tokoin", "B01").id, byLabel("Cour Adidogomé", "Ch3").id]);

  const otherUnits = allUnits.filter((u) => !special.has(u.id) && !leroyVacant.has(u.id) && !["Résidence Tokoin", "Villa Bè", "Cour Adidogomé"].includes(u.propertyName));
  // 12 vacants au total (3 chez Leroy + 9 ailleurs), 5 réservés, 2 autres locataires en retard ailleurs
  const vacant = new Set(otherUnits.filter((_, i) => i % 12 === 7).slice(0, 9).map((u) => u.id));
  const reserved = new Set(otherUnits.filter((u, i) => !vacant.has(u.id) && i % 19 === 3).slice(0, 5).map((u) => u.id));
  const lateElsewhere = otherUnits.filter((u) => !vacant.has(u.id) && !reserved.has(u.id)).filter((_, i) => i % 40 === 11).slice(0, 2);

  const users4 = new Map<string, string>();
  for (const [, s] of special) if (s.account) users4.set(s.phone, (await mkUser(s.account, s.phone)).id);

  let leaseCount = 0;
  let paymentCount = 0;
  const occupy = async (u: U, t: { name: string; phone: string; scenario: Scenario; months: number; dueDay?: number }) => {
    const start = addMonths(TODAY, -(t.months - 1));
    const { tenant } = await createTenant(ctx, { fullName: t.name, phone: t.phone });
    if (users4.has(t.phone)) await db.update(tenants).set({ userId: users4.get(t.phone)! }).where(eq(tenants.id, tenant.id));
    const lease = await createLease(ctx, { tenantId: tenant.id, unitId: u.id, startDate: start, dueDay: t.dueDay, depositPaid: u.rent * 2, depositMethod: "CASH" } as never, TODAY);
    leaseCount++;
    const terms = { startDate: start, endDate: null, rentAmount: u.rent, periodicity: "MONTHLY" as const, dueDay: t.dueDay ?? 5 };
    const periods = scheduleUntil(terms, TODAY);
    const due = periods.filter((p) => p.dueDate < TODAY);
    let toPay = periods.length;
    if (t.scenario === "LATE") toPay = Math.max(0, due.length - 2);
    if (t.scenario === "UNPAID_CURRENT") toPay = Math.max(0, due.length - 1); // dernier mois échu non payé
    if (t.scenario === "PARTIAL_LATE") toPay = due.length - 1;
    if (t.scenario === "PARTIAL_CURRENT") toPay = due.length;
    for (let i = 0; i < toPay; i++) {
      const p = periods[i];
      const paidAt = clampDate(addDays(p.dueDate, -Math.floor(rand() * 4)), start, TODAY);
      await pay(lease.id, "LOYER", u.rent, paidAt);
    }
    if (t.scenario === "PARTIAL_LATE") await pay(lease.id, "LOYER", Math.round(u.rent / 2 / 1000) * 1000, clampDate(addDays(due[due.length - 1].dueDate, 1), start, TODAY));
    if (t.scenario === "PARTIAL_CURRENT") await pay(lease.id, "LOYER", Math.round((u.rent * 2) / 3 / 1000) * 1000, TODAY);
    if (t.scenario === "AHEAD") await pay(lease.id, "AVANCE", u.rent * 3, clampDate(addDays(TODAY, -2), start, TODAY));
    return lease;
  };
  const pay = async (leaseId: string, type: "LOYER" | "AVANCE", amount: number, paidAt: string) => {
    const method = pick(["CASH", "CASH", "TMONEY", "FLOOZ", "BANK"] as const);
    await recordPayment(ctx, { leaseId, type, amount, method, paidAt, reference: method === "TMONEY" || method === "FLOOZ" ? `TX${Math.floor(rand() * 1e8)}` : null }, TODAY);
    paymentCount++;
  };

  for (const u of allUnits) {
    const s = special.get(u.id);
    if (s) {
      await occupy(u, s);
      continue;
    }
    if (leroyVacant.has(u.id) || vacant.has(u.id)) continue;
    if (reserved.has(u.id)) {
      await setUnitReserved(ctx, u.id, true);
      continue;
    }
    const late = lateElsewhere.includes(u);
    const ahead = !late && rand() < 0.08;
    await occupy(u, {
      name: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `+2289${String(2000000 + leaseCount * 7919).slice(-7)}`,
      scenario: late ? "LATE" : ahead ? "AHEAD" : "UP_TO_DATE",
      months: 3 + Math.floor(rand() * 6),
    });
  }
  console.log(`${leaseCount} locations, ${paymentCount} paiements.`);

  /* ── Contestation, demande, notifications de démo ── */
  const [ama] = await db.select().from(leases).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(tenants.phone, "+22890000004"));
  await db.insert(disputes).values({
    organizationId: org.id,
    leaseId: ama.leases.id,
    amount: 75000,
    date: dayOfMonth(addMonths(TODAY, -1), 6),
    comment: "J'ai payé 75 000 F par Flooz le mois dernier, le paiement n'apparaît pas.",
    createdBy: users4.get("+22890000004")!,
  });
  const [kossi] = await db.select().from(leases).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(tenants.phone, "+22890000003"));
  await db.insert(requests).values({ organizationId: org.id, leaseId: kossi.leases.id, subject: "Robinet de la cuisine qui fuit", message: "Bonjour, le robinet de la cuisine fuit depuis deux jours. Merci de faire passer quelqu'un.", createdBy: users4.get("+22890000003")! });

  // Les notifications générées pendant la démo sont marquées lues (on garde les 2 plus récentes non lues)
  await db.execute(sql`update notifications set read_at = now() where id not in (select id from notifications n2 where n2.user_id = notifications.user_id order by created_at desc limit 2)`);

  console.log("\nDémo prête ✅  (mot de passe pour tous : " + PASSWORD + ")");
  console.log("  Agence       : 90 00 00 01  (Admin ZE IMMOBILIER)");
  console.log("  Propriétaire : 90 00 00 02  (Leroy Agouze — consultation de ses 3 immeubles)");
  console.log("  Locataire    : 90 00 00 03  (Kossi Mensah — à jour)");
  console.log("  Locataire    : 90 00 00 04  (Ama Doe — en retard)");
  console.log("  Locataire    : 90 00 00 05  (Yao Agbeko — en avance)");
  console.log("  Comptable    : 90 00 00 06  (Afi — rôle Comptable)");
}

function clampDate(d: string, min: string, max: string) {
  return d < min ? min : d > max ? max : d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
