import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { isDesktop } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { NETWORKS } from "@/modules/billing/paygate";
import { companySubscriptionOrder, SUB_DURATIONS } from "@/modules/billing/subscription-orders";
import { simulateSubscriptionAction } from "../actions";
import { RefreshWhilePending } from "./refresh";

export const metadata = { title: "Paiement de l'abonnement" };
export const dynamic = "force-dynamic";

export default async function SubscriptionOrderPage({ params }: { params: Promise<{ ref: string }> }) {
  if (isDesktop()) notFound();
  const { ref } = await params;
  const ctx = await requireContext();
  const o = await companySubscriptionOrder(ctx.companyId, ref).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const what = `${o.planName}, ${SUB_DURATIONS[o.months]?.label ?? `${o.months} mois`}`;
  return (
    <>
      <PageHeader title="Paiement de l'abonnement" subtitle={`Commande ${o.reference}`} actions={<Link href="/abonnement" className="btn-secondary">Retour</Link>} />
      <Card className="max-w-2xl">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Formule {what}</h2>
            <p className="text-sm text-slate-500">
              {formatMoney(o.amount, o.currency)} · {NETWORKS[o.network] ?? o.network} {o.phone}
            </p>
            {o.promoCode && o.discountAmount > 0 && (
              <p className="text-sm text-emerald-700">
                Code promo {o.promoCode} : −{formatMoney(o.discountAmount, o.currency)} sur {formatMoney(o.listAmount, o.currency)}
              </p>
            )}
          </div>

          {o.status === "pending" && o.provider === "simulation" && (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                <b>Mode test.</b> Sur le vrai service, une demande de confirmation arrive ici sur le téléphone. Choisissez le résultat du paiement :
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={simulateSubscriptionAction.bind(null, o.reference, "paid")}>
                  <button className="btn-primary">Paiement réussi</button>
                </form>
                <form action={simulateSubscriptionAction.bind(null, o.reference, "failed")}>
                  <button className="btn-secondary">Paiement refusé</button>
                </form>
              </div>
            </div>
          )}

          {o.status === "pending" && o.provider !== "simulation" && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <p className="font-medium">Confirmez le paiement sur votre téléphone.</p>
              <p className="mt-1">
                Une demande {NETWORKS[o.network] ?? ""} de {formatMoney(o.amount, o.currency)} a été envoyée au {o.phone}. Tapez votre code secret pour valider. Cette page se
                met à jour toute seule.
              </p>
            </div>
          )}
          {o.status === "pending" && <RefreshWhilePending />}

          {o.status === "paid" && (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p>
                <b>Paiement confirmé, merci !</b> Votre formule {o.planName} est active
                {o.periodEnd ? ` jusqu'au ${formatDate(o.periodEnd)}` : ""}.
              </p>
              <Link href="/" className="btn-primary">Continuer</Link>
            </div>
          )}

          {o.status === "failed" && (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">
                <b>Le paiement n&apos;a pas abouti.</b> {o.failureReason ?? ""} Aucun montant n&apos;a été prélevé pour cette commande.
              </p>
              <Link href="/abonnement" className="btn-secondary">Réessayer</Link>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
