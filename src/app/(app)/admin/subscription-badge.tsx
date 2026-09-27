import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { SubscriptionState } from "@/modules/billing/access";

/** Résumé lisible de l'état d'abonnement : type d'accès et échéance. */
export function SubscriptionBadge({ state }: { state: SubscriptionState }) {
  if (state.unlimited) return <Badge tone="blue">Accès illimité offert</Badge>;
  if (state.readOnly) {
    const label =
      state.status === "trialing" ? "Essai terminé" : state.status === "active" ? "Expiré" : state.status === "past_due" ? "Impayé" : state.status === "suspended" ? "Abonnement suspendu" : "Résilié";
    return <Badge tone="amber">{label} · lecture seule</Badge>;
  }
  if (state.status === "trialing") return <Badge tone="gray">Essai{state.trialDaysLeft !== null && ` · ${state.trialDaysLeft} j restants`}</Badge>;
  if (state.periodEndsAt) {
    return (
      <Badge tone={state.periodDaysLeft !== null && state.periodDaysLeft <= 7 ? "amber" : "green"}>
        Payé jusqu&apos;au {formatDate(state.periodEndsAt)}
      </Badge>
    );
  }
  return <Badge tone="green">Actif</Badge>;
}
