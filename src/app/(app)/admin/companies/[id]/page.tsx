import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader, SelectField, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { FREE_DURATIONS, getCompanyAdmin, PAYMENT_METHODS } from "@/modules/admin/service";
import { grantFreeAccessAction, extendTrialAction, recordPaymentAction, setPlanAction, setStatusAction, setUnlimitedAction } from "../../actions";
import { SubscriptionBadge } from "../../subscription-badge";

export const metadata = { title: "Abonnement" };

export default async function CompanyAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getCompanyAdmin(s, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { company: c, subscription: sub, plan, state } = d;
  const paidPlans = d.plans.filter((p) => p.monthlyPrice > 0);
  const methods = Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.ownerName, c.email, c.phone, [c.city, c.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        actions={<Link href="/admin" className="btn-secondary">Retour</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Situation" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Formule</dt><dd className="font-medium">{plan?.name ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Accès</dt><dd>{state ? <SubscriptionBadge state={state} /> : "—"}</dd></div>
            {sub?.status === "trialing" && sub.trialEndsAt && !sub.unlimited && (
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Fin de l&apos;essai</dt><dd>{formatDate(sub.trialEndsAt)}</dd></div>
            )}
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Inscrite le</dt><dd>{formatDate(c.createdAt)}</dd></div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Entreprise</dt>
              <dd>{c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspendue</Badge>}</dd>
            </div>
            {sub?.notes && <div className="rounded-lg bg-slate-50 p-2 text-slate-600">{sub.notes}</div>}
          </dl>
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {sub && !sub.unlimited && !(state && !state.readOnly && sub.status === "active") && (
              <ActionForm action={extendTrialAction.bind(null, c.id)}>
                <SubmitButton className="btn-secondary w-full">Offrir 14 jours d&apos;essai</SubmitButton>
              </ActionForm>
            )}
            <ActionForm action={setStatusAction.bind(null, c.id, c.status === "active" ? "suspended" : "active")}>
              <SubmitButton className={c.status === "active" ? "btn-secondary w-full text-red-600" : "btn-primary w-full"}>
                {c.status === "active" ? "Suspendre l'entreprise" : "Réactiver l'entreprise"}
              </SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <Card title="Enregistrer un paiement" className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-500">
            Active l&apos;abonnement payant. Si une période payée est en cours, la nouvelle durée s&apos;ajoute à sa fin.
          </p>
          <ActionForm action={recordPaymentAction.bind(null, c.id)} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <SelectField
              label="Formule"
              name="planId"
              defaultValue={plan && plan.monthlyPrice > 0 ? plan.id : paidPlans[0]?.id}
              options={paidPlans.map((p) => ({ value: p.id, label: `${p.name} · ${formatMoney(p.monthlyPrice, p.currency)} / mois` }))}
            />
            <Field label="Nombre de mois" name="months" type="number" min={1} max={36} defaultValue={1} required />
            <Field label="Montant reçu (FCFA)" name="amount" type="number" min={0} step="1" required />
            <SelectField label="Moyen de paiement" name="method" options={methods} />
            <Field label="Référence (n° de transaction)" name="reference" className="sm:col-span-2" />
            <div className="sm:col-span-2"><SubmitButton>Enregistrer le paiement</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Activer gratuitement" className="lg:col-span-2">
          {sub?.unlimited ? (
            <ActionForm action={setUnlimitedAction.bind(null, c.id, false)}>
              <p className="mb-3 text-sm text-slate-600">
                Cette entreprise a un accès complet sans date de fin ni limite de formule. En le retirant, elle garde sa période payée en cours s&apos;il y en a une, sinon elle passe en lecture seule.
              </p>
              <SubmitButton className="btn-secondary text-red-600">Retirer l&apos;accès illimité</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={grantFreeAccessAction.bind(null, c.id)} className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-slate-600 sm:col-span-2">Accès complet sans paiement : promotion, partenaire, compte de démonstration. La durée s&apos;ajoute à une période en cours.</p>
              <SelectField label="Durée" name="duration" defaultValue="1" options={Object.entries(FREE_DURATIONS).map(([value, label]) => ({ value, label }))} />
              <SelectField
                label="Formule"
                name="planId"
                // compte offert : la formule la plus complète par défaut, sauf si l'entreprise en a déjà une payante
                defaultValue={plan && plan.monthlyPrice > 0 ? plan.id : [...d.plans].sort((a, b) => b.monthlyPrice - a.monthlyPrice)[0]?.id}
                options={d.plans.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Field label="Motif (facultatif)" name="note" placeholder="Ex. partenaire ZE GROUP" className="sm:col-span-2" />
              <div className="sm:col-span-2"><SubmitButton>Activer gratuitement</SubmitButton></div>
            </ActionForm>
          )}
        </Card>

        <Card title="Changer de formule" className="lg:col-span-1">
          <ActionForm action={setPlanAction.bind(null, c.id)} className="space-y-3">
            <p className="text-sm text-slate-500">Change seulement les limites (utilisateurs, produits, boutiques), sans toucher aux dates.</p>
            <SelectField label="Formule" name="planId" defaultValue={plan?.id} options={d.plans.map((p) => ({ value: p.id, label: p.name }))} />
            <SubmitButton className="btn-secondary">Appliquer</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card title="Historique des paiements" className="mt-4">
        {d.payments.length === 0 ? (
          <EmptyState title="Aucun paiement enregistré" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Formule</th><th>Période</th><th>Moyen</th><th>Référence</th><th className="text-right">Montant</th><th>Saisi par</th></tr>
              </thead>
              <tbody>
                {d.payments.map(({ payment: p, plan: planName, recordedBy }) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.createdAt, true)}</td>
                    <td>{planName}</td>
                    <td>{formatDate(p.periodStart)} → {formatDate(p.periodEnd)} ({p.months} mois)</td>
                    <td>{PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method}</td>
                    <td>{p.reference ?? "—"}</td>
                    <td className="text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
                    <td className="text-slate-500">{recordedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
