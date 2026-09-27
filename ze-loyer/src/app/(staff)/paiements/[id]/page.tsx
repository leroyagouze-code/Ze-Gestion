import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Money, Notice, PageHeader, Row, TextArea } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { capitalize, longDate, monthLabel } from "@/modules/finance/dates";
import { METHOD_LABELS, TYPE_LABELS } from "@/modules/finance/labels";
import { getPayment } from "@/modules/finance/service";
import { cancelPaymentAction } from "../actions";

export const metadata: Metadata = { title: "Paiement" };

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nouveau?: string }> }) {
  const ctx = await requireStaff("payment.read");
  const { id } = await params;
  const { nouveau } = await searchParams;
  const d = await found(getPayment(ctx, id));
  const p = d.payment;
  const cancelled = p.status === "CANCELLED";
  return (
    <>
      <PageHeader title={`${TYPE_LABELS[p.type]} · ${d.tenant.fullName}`} subtitle={`${d.unit.label} · ${d.property.name}`} back={{ href: `/locations/${d.lease.id}`, label: "Voir la location" }} />
      {nouveau && (
        <div className="mb-4">
          <Notice tone="green" title="✅ Paiement enregistré">
            {d.receiptId ? "La quittance est prête." : "L'opération est enregistrée."} {d.tenant.userId ? "Le locataire la voit dans son espace." : ""}
          </Notice>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Détail" action={cancelled ? <Badge tone="gray">Annulé</Badge> : <Badge tone="green">Enregistré</Badge>}>
          <p className={`mb-3 text-[32px] font-extrabold tabular-nums ${cancelled ? "text-stone-400 line-through" : ""}`}>
            <Money value={p.amount} unit="FCFA" />
          </p>
          <dl className="divide-y divide-sand-100">
            <Row label="Date">{longDate(p.paidAt)}</Row>
            <Row label="Mode">{METHOD_LABELS[p.method]}</Row>
            {p.reference && <Row label="Référence">{p.reference}</Row>}
            {p.note && <Row label="Note">{p.note}</Row>}
            <Row label="Enregistré par">{d.recordedByName ?? "—"}</Row>
            {d.receiptNumber && <Row label="Quittance">{d.receiptNumber}</Row>}
          </dl>
          {d.allocations.length > 0 && (
            <div className="mt-4">
              <p className="text-[14px] font-semibold text-stone-600">Réparti sur :</p>
              <ul className="mt-1 space-y-1">
                {d.allocations.map((a) => (
                  <li key={a.periodStart} className="flex justify-between text-[15px]">
                    <span>{capitalize(monthLabel(a.periodStart))}</span>
                    <span>
                      <Money value={a.amount} className="font-semibold" />
                      {a.amount < a.chargeAmount ? <span className="text-amber-800"> (partiel)</span> : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {(p.type === "LOYER" || p.type === "AVANCE") && (
                <p className="mt-2 text-[13px] text-stone-500">Les mois futurs payés d&apos;avance apparaissent dans le carnet et la quittance.</p>
              )}
            </div>
          )}
          {d.receiptId && !cancelled && (
            <a href={`/api/quittances/${d.receiptId}/pdf`} target="_blank" className="btn-primary mt-5 w-full">
              🧾 Télécharger la quittance PDF
            </a>
          )}
          {cancelled && (
            <div className="mt-4">
              <Notice tone="gray" title="Paiement annulé">
                {p.cancelReason} — le {p.cancelledAt?.toLocaleDateString("fr-FR")}
              </Notice>
            </div>
          )}
        </Card>
        {!cancelled && can(ctx.permissions, "payment.cancel") && (
          <Card title="Corriger une erreur">
            <p className="mb-3 text-[15px] text-stone-700">
              Un paiement n&apos;est jamais supprimé. En cas d&apos;erreur, annulez-le (il reste visible, barré) puis enregistrez le bon montant.
            </p>
            <ActionForm action={cancelPaymentAction.bind(null, p.id)} confirm="Annuler ce paiement ? Cette action est enregistrée dans le journal." className="space-y-3">
              <TextArea label="Raison de l'annulation" name="reason" required minLength={3} />
              <SubmitButton className="btn-danger w-full" pendingText="Annulation…">
                Annuler ce paiement
              </SubmitButton>
            </ActionForm>
            <Link href={`/paiements/nouveau?location=${d.lease.id}`} className="btn-ghost mt-2 w-full">
              Enregistrer le bon paiement
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
