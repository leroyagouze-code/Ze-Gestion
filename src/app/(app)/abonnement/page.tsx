import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { isDesktop } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { paymentMode } from "@/modules/billing/paygate";
import { canPayOnline, listCompanySubscriptionOrders, listSubscriptionOffers, SUB_DURATIONS, type SubMonths } from "@/modules/billing/subscription-orders";
import { previewSubscriptionPromoAction, subscribeAction } from "./actions";
import { SubscribeForm, type PlanOffer } from "./subscribe-form";

export const metadata = { title: "Abonnement" };
export const dynamic = "force-dynamic";

const SUPPORT = process.env.SUPPORT_CONTACT || "contact@zegroupafrica.com";
const STATUS = { pending: ["En attente", "amber"], paid: ["Payé", "green"], failed: ["Échoué", "red"] } as const;

export default async function SubscriptionPage() {
  if (isDesktop()) notFound();
  const ctx = await requireContext();
  const s = ctx.subscription;
  const [offers, orders] = await Promise.all([listSubscriptionOffers(), listCompanySubscriptionOrders(ctx.companyId)]);
  const plans: PlanOffer[] = offers.map((p) => ({
    code: p.code,
    name: p.name,
    features: p.features,
    durations: p.durations.map((d) => {
      const full = p.monthlyPrice * d.months;
      return {
        months: d.months,
        label: d.label,
        amount: formatMoney(d.amount, p.currency),
        perMonth: d.months > 1 ? formatMoney(Math.round(d.amount / d.months), p.currency) : null,
        saving: full > d.amount ? `${formatMoney(full - d.amount, p.currency)} d'économie` : null,
      };
    }),
  }));
  const currentCode = offers.find((o) => o.name === s.planName)?.code ?? null;
  const open = canPayOnline(ctx.user);

  const situation = s.unlimited
    ? `Accès offert, formule ${s.planName}, sans date de fin.`
    : s.status === "trialing"
      ? s.readOnly
        ? "Votre essai gratuit est terminé : le compte est en lecture seule."
        : `Essai gratuit : ${s.trialDaysLeft === 1 ? "dernier jour" : `${s.trialDaysLeft} jours restants`}.`
      : s.status === "active" && !s.readOnly
        ? `Formule ${s.planName}${s.periodEndsAt ? `, payée jusqu'au ${formatDate(s.periodEndsAt)}` : ""}.`
        : s.expired
          ? `Votre abonnement a expiré le ${formatDate(s.periodEndsAt!)} : le compte est en lecture seule.`
          : "Votre abonnement n'est plus actif : le compte est en lecture seule.";

  return (
    <>
      <PageHeader
        title="Abonnement"
        subtitle="Choisissez votre formule et payez par TMoney ou Flooz : l'accès est activé dès la confirmation du paiement."
        actions={<Link href="/tarifs" className="btn-secondary">Voir les tarifs</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Votre situation">
            <p className="text-sm text-slate-700">{situation}</p>
            {s.status === "active" && !s.readOnly && !s.unlimited && (
              <p className="mt-1 text-xs text-slate-500">Un nouveau paiement s&apos;ajoute à la fin de la période en cours : vous ne perdez aucun jour.</p>
            )}
          </Card>
          <Card title={s.status === "active" && !s.readOnly ? "Renouveler ou changer de formule" : "S'abonner"}>
            {!ctx.isAdmin ? (
              <p className="text-sm text-slate-600">Seul l&apos;administrateur de l&apos;entreprise peut payer l&apos;abonnement. Prévenez-le.</p>
            ) : !open ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Le paiement en ligne arrive très bientôt. Pour vous abonner dès maintenant, contactez {SUPPORT} : votre accès sera activé dès réception du paiement.
              </p>
            ) : (
              <>
                {paymentMode() === "simulation" && (
                  <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <b>Mode test.</b> Aucun argent n&apos;est prélevé : à l&apos;étape suivante, vous choisissez si le paiement réussit ou échoue.
                  </p>
                )}
                <SubscribeForm action={subscribeAction} previewAction={previewSubscriptionPromoAction} plans={plans} currentPlan={currentCode} phone={ctx.company.phone ?? ""} />
              </>
            )}
          </Card>
        </div>
        <Card title="Paiements en ligne">
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun paiement en ligne pour l&apos;instant.</p>
          ) : (
            <TableWrap>
              <table className="table">
                <tbody>
                  {orders.map((o) => {
                    const [label, tone] = STATUS[o.status as keyof typeof STATUS] ?? [o.status, "gray"];
                    return (
                      <tr key={o.reference}>
                        <td>
                          <Link href={`/abonnement/${o.reference}`} className="font-medium text-brand-700 hover:underline">
                            {o.planName}, {SUB_DURATIONS[o.months as SubMonths]?.label ?? `${o.months} mois`}
                          </Link>
                          <div className="text-xs text-slate-500">{formatDate(o.createdAt)}</div>
                        </td>
                        <td className="text-right tabular-nums">{formatMoney(o.amount, o.currency)}</td>
                        <td><Badge tone={tone}>{label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
