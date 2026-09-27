import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { isDesktop, verifyLicense } from "@/lib/license";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

export type SubscriptionState = {
  planName: string | null;
  status: string | null;
  unlimited: boolean;
  trialEndsAt: Date | null;
  /** Jours d'essai restants (arrondis au-dessus), null hors période d'essai. */
  trialDaysLeft: number | null;
  /** Fin de la période payée (null : sans date de fin). */
  periodEndsAt: Date | null;
  periodDaysLeft: number | null;
  /** Période payée dépassée sans renouvellement. */
  expired: boolean;
  /** Essai terminé, période payée dépassée, ou abonnement impayé / arrêté : consultation seulement. */
  readOnly: boolean;
};

type SubRow = { status: string; trialEndsAt: Date | null; planName: string; currentPeriodEnd?: Date | null; unlimited?: boolean };

const DAY = 86_400_000;
const BLOCKING = new Set(["past_due", "suspended", "canceled"]);
const daysLeft = (end: Date, now: Date) => Math.ceil((end.getTime() - now.getTime()) / DAY);

export function computeState(sub: SubRow | undefined, now = new Date()): SubscriptionState {
  const base = { planName: null, status: null, unlimited: false, trialEndsAt: null, trialDaysLeft: null, periodEndsAt: null, periodDaysLeft: null, expired: false, readOnly: false };
  if (!sub) return base;
  const common = { ...base, planName: sub.planName, status: sub.status, trialEndsAt: sub.trialEndsAt, periodEndsAt: sub.currentPeriodEnd ?? null };
  // Accès offert : rien n'expire, seule une suspension explicite de l'entreprise l'arrête
  if (sub.unlimited) return { ...common, unlimited: true };
  if (sub.status === "trialing") {
    const over = sub.trialEndsAt !== null && sub.trialEndsAt.getTime() <= now.getTime();
    return { ...common, trialDaysLeft: sub.trialEndsAt && !over ? daysLeft(sub.trialEndsAt, now) : null, readOnly: over };
  }
  if (sub.status === "active") {
    const end = sub.currentPeriodEnd ?? null;
    const expired = end !== null && end.getTime() <= now.getTime();
    return { ...common, periodDaysLeft: end && !expired ? daysLeft(end, now) : null, expired, readOnly: expired };
  }
  return { ...common, readOnly: BLOCKING.has(sub.status) };
}

export async function subscriptionState(companyId: string): Promise<SubscriptionState> {
  const [sub] = await db
    .select({
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      unlimited: subscriptions.unlimited,
      licenseCode: subscriptions.licenseCode,
      planName: plans.name,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (sub && isDesktop()) return computeState(desktopSubscription(sub));
  return computeState(sub);
}

/**
 * Logiciel de bureau : l'accès dépend uniquement d'un code de licence valide pour ce poste
 * (revérifié à chaque fois) ; sans licence, c'est l'essai gratuit.
 */
export function desktopSubscription(sub: { trialEndsAt: Date | null; planName: string; licenseCode: string | null }, installId = process.env.ZE_INSTALL_ID ?? "") {
  const license = sub.licenseCode ? verifyLicense(sub.licenseCode, installId) : null;
  if (!license) return { status: "trialing", trialEndsAt: sub.trialEndsAt, planName: sub.planName };
  const planName = license.plan.charAt(0) + license.plan.slice(1).toLowerCase();
  return { status: "active", trialEndsAt: null, planName, currentPeriodEnd: license.expiresAt, unlimited: license.expiresAt === null };
}

/**
 * Permissions encore permises en lecture seule : tout consulter et exporter ses données
 * (le commerçant garde l'accès à ce qui lui appartient), mais plus rien créer ni modifier.
 */
const READ_ONLY_ALLOWED = new Set<Permission>([
  ...ALL_PERMISSIONS.filter((p) => p.endsWith(".view") || p === "sales.view_all"),
  "reports.profit",
  "products.cost",
  "data.export",
]);

export function readOnlyPermissions(perms: string[]) {
  return perms.filter((p) => READ_ONLY_ALLOWED.has(p as Permission));
}

/** Mention « Édité avec ZE Gestion » sur les documents : seulement pendant l'essai (ou sans accès actif). */
export function showAppCredit(state: SubscriptionState) {
  return !(state.unlimited || (state.status === "active" && !state.readOnly));
}
