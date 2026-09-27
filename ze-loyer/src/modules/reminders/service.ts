/*
 * Rappels automatiques : J-7, J-3, J-1, Jour J (locataire) ; J+3, J+7 (locataire + gestionnaires).
 * Lancés une fois par jour (npm run cron:rappels ou GET /api/cron/rappels).
 * Notifications WEB uniquement tant qu'aucun canal externe n'est configuré.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { leases, organizations, tenants, units } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { dayMonth, daysBetween, todayISO } from "../finance/dates";
import { loadLedgers, syncLeases } from "../finance/service";
import { notify } from "../notifications/service";
import { notifyStaff } from "../notifications/staff";
import { assertCan } from "@/lib/permissions";
import { getScopedLease } from "../access";
import type { StaffCtx } from "../auth/context";
import { audit } from "../audit/service";
import { whatsappLink } from "../invitations/service";

export const REMINDER_OFFSETS = [-7, -3, -1, 0, 3, 7] as const;

/** Libellé du rappel pour un décalage (jours après l'échéance). */
export function reminderText(offset: number, amount: number, dueDate: string) {
  const m = formatMoney(amount);
  if (offset < 0) return { title: `Loyer dans ${-offset} jour${offset === -1 ? "" : "s"}`, body: `Votre loyer de ${m} est à payer le ${dayMonth(dueDate)}.` };
  if (offset === 0) return { title: "Loyer à payer aujourd'hui", body: `Votre loyer de ${m} est à payer aujourd'hui.` };
  return { title: `Loyer en retard de ${offset} jours`, body: `Il reste ${m} à payer (échéance du ${dayMonth(dueDate)}). Contactez votre propriétaire ou agence si besoin.` };
}

export async function runReminders(today = todayISO()) {
  const rows = await db
    .select({ lease: leases, tenantUserId: tenants.userId, tenantName: tenants.fullName, unitLabel: units.label })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(organizations, eq(organizations.id, leases.organizationId))
    .where(and(eq(leases.status, "ACTIVE"), inArray(organizations.kind, ["AGENCY", "OWNER"])));
  await syncLeases(rows.map((r) => r.lease), today);
  const ledgers = await loadLedgers(db, rows.map((r) => r.lease), today);
  let sent = 0;
  for (const r of rows) {
    const s = ledgers.get(r.lease.id)!;
    const candidates = s.lines.filter((l) => l.kind === "CHARGE" && l.remaining > 0);
    // Prochaine échéance future couverte partiellement / non couverte (pas encore matérialisée)
    if (s.nextDue && !candidates.some((c) => c.dueDate === s.nextDue!.date)) candidates.push({ dueDate: s.nextDue.date, remaining: s.nextDue.amount } as (typeof candidates)[number]);
    for (const c of candidates) {
      const offset = daysBetween(c.dueDate, today);
      if (!(REMINDER_OFFSETS as readonly number[]).includes(offset)) continue;
      const text = reminderText(offset, c.remaining, c.dueDate);
      const key = `rem:${r.lease.id}:${c.dueDate}:${offset}`;
      if (r.tenantUserId) {
        if (await notify(db, { userId: r.tenantUserId, organizationId: r.lease.organizationId, ...text, link: "/mon-espace/carnet", dedupeKey: key })) sent++;
      }
      if (offset > 0)
        await notifyStaff(db, r.lease.organizationId, "payment.write", {
          title: `Retard : ${r.tenantName} (${r.unitLabel})`,
          body: `${formatMoney(c.remaining)} impayé depuis ${offset} jours.`,
          link: `/impayes`,
          dedupeKey: key,
        });
    }
  }
  return { leases: rows.length, sent };
}

/* ─────────── Relance manuelle (bouton « Relancer ») ─────────── */

export async function remindTenant(ctx: StaffCtx, leaseId: string, today = todayISO()) {
  assertCan(ctx.permissions, "payment.write");
  const { lease, tenant, unit } = await getScopedLease(ctx, leaseId);
  await syncLeases([lease], today);
  const s = (await loadLedgers(db, [lease], today)).get(lease.id)!;
  const due = s.overdueAmount > 0 ? s.overdueAmount : s.amountDue;
  const first = tenant.fullName.split(" ")[0];
  const message =
    due > 0
      ? `Bonjour ${first}, petit rappel de ${ctx.orgName} : il reste ${formatMoney(due)} à payer pour votre loyer (${unit.label}). Merci !`
      : `Bonjour ${first}, votre loyer (${unit.label}) est à jour. Merci !`;
  let inApp = false;
  if (tenant.userId)
    inApp = await notify(db, {
      userId: tenant.userId,
      organizationId: ctx.orgId,
      title: "Rappel de paiement",
      body: message,
      link: "/mon-espace/carnet",
      dedupeKey: `relance:${lease.id}:${today}`,
    });
  await audit(db, {
    organizationId: ctx.orgId,
    userId: ctx.userId,
    action: "lease.remind",
    summary: `Relance de ${tenant.fullName} (${unit.label}) — ${formatMoney(due)}${inApp ? " · notification dans son espace" : ""}`,
    entityType: "lease",
    entityId: lease.id,
    ip: ctx.ip,
  });
  return { inApp, hasAccount: !!tenant.userId, whatsapp: whatsappLink(tenant.phone, message), sms: `sms:${tenant.phone}?body=${encodeURIComponent(message)}` };
}
