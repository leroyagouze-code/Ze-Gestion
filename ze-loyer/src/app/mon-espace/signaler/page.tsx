import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice, PageHeader, SelectField, TextArea } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { shortDate } from "@/modules/finance/dates";
import { TYPE_LABELS } from "@/modules/finance/labels";
import { tenantOverview } from "@/modules/portal/service";
import { createDisputeAction } from "../actions";
import { NoLease } from "../no-lease";

export const metadata: Metadata = { title: "Signaler une erreur" };

export default async function ReportErrorPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const ctx = await requireTenant();
  const { paiement } = await searchParams;
  const o = await tenantOverview(ctx.userId);
  if (!o.current) return <NoLease phone={ctx.phone} />;
  return (
    <>
      <PageHeader title="⚠️ Signaler une erreur" back={{ href: "/mon-espace/carnet", label: "Mon carnet" }} />
      <div className="mb-4">
        <Notice tone="blue">Vous ne pouvez pas modifier votre historique vous-même. Votre agence / propriétaire recevra votre signalement et vous répondra.</Notice>
      </div>
      <ActionForm action={createDisputeAction} className="card space-y-4 p-5">
        <input type="hidden" name="leaseId" value={o.current.lease.id} />
        <SelectField
          label="Paiement concerné"
          name="paymentId"
          options={o.payments.map((p) => ({ value: p.payment.id, label: `${TYPE_LABELS[p.payment.type]} · ${formatMoney(p.payment.amount)} · ${shortDate(p.payment.paidAt)}` }))}
          defaultValue={paiement}
          placeholder="Un paiement manque / aucun en particulier"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Montant (FCFA)" name="amount" inputMode="numeric" placeholder="75 000" />
          <Field label="Date du paiement" name="date" type="date" />
        </div>
        <TextArea label="Expliquez l'erreur" name="comment" placeholder="Ex. J'ai payé 75 000 F par TMoney le 5 septembre, il n'apparaît pas." required />
        <Field label="Preuve (photo ou PDF, facultatif)" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hint="Capture Mobile Money, reçu… 5 Mo maximum" />
        <SubmitButton className="btn-primary w-full" pendingText="Envoi…">
          Envoyer le signalement
        </SubmitButton>
      </ActionForm>
    </>
  );
}
