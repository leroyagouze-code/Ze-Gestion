import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

export type SubscriptionState = {
  planName: string | null;
  status: string | null;
  trialEndsAt: Date | null;
  /** Jours d'essai restants (arrondis au-dessus), null hors période d'essai. */
  trialDaysLeft: number | null;
  /** Essai terminé sans formule payée, ou abonnement impayé / arrêté : consultation seulement. */
  readOnly: boolean;
};

const DAY = 86_400_000;
const BLOCKING = new Set(["past_due", "suspended", "canceled"]);

export function computeState(sub: { status: string; trialEndsAt: Date | null; planName: string } | undefined, now = new Date()): SubscriptionState {
  if (!sub) return { planName: null, status: null, trialEndsAt: null, trialDaysLeft: null, readOnly: false };
  const trialing = sub.status === "trialing";
  const trialOver = trialing && sub.trialEndsAt !== null && sub.trialEndsAt.getTime() <= now.getTime();
  return {
    planName: sub.planName,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    trialDaysLeft: trialing && sub.trialEndsAt && !trialOver ? Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY) : null,
    readOnly: trialOver || BLOCKING.has(sub.status),
  };
}

export async function subscriptionState(companyId: string): Promise<SubscriptionState> {
  const [sub] = await db
    .select({ status: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return computeState(sub);
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
