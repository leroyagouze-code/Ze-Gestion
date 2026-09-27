import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ShareInvoice } from "@/components/share-invoice";
import { Badge, Card, Field, PageHeader, SelectField } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty, priceBasis, shownLineTotal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { INVOICE_STATUS } from "@/modules/invoices/labels";
import { getInvoice } from "@/modules/invoices/service";
import { listPaymentMethods } from "@/modules/sales/service";
import { cancelInvoiceAction, invoicePaymentAction } from "../actions";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const ctx = await requireContext("invoices.view");
  const { id } = await params;
  const { invoice: inv, items } = await getInvoice(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const st = INVOICE_STATUS[inv.status];
  const publicUrl = `${process.env.APP_URL ?? ""}/f/${inv.publicToken}`;
  const open = inv.status !== "cancelled" && inv.status !== "paid";
  const canPay = open && !inv.saleId && can(ctx.permissions, "invoices.create");
  const methods = canPay ? await listPaymentMethods(ctx, { excludeCredit: true }) : [];
  const c = inv.customerSnapshot;
  return (
    <>
      <PageHeader
        title={`Facture ${inv.number}`}
        subtitle={`Émise le ${formatDate(inv.issueDate)}${inv.dueDate ? ` · échéance ${formatDate(inv.dueDate)}` : ""}`}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" className="btn-primary">Télécharger le PDF</a>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Détail" className="xl:col-span-2">
          <div className="mb-4 text-sm">
            <div className="text-slate-500">Client</div>
            {inv.customerId ? <Link href={`/customers/${inv.customerId}`} className="font-medium text-brand-700">{c?.name}</Link> : <div className="font-medium">{c?.name ?? "Client comptoir"}</div>}
            {inv.saleId && <div className="mt-1"><Link href={`/sales/${inv.saleId}`} className="text-slate-500 hover:underline">Voir la vente d&apos;origine</Link></div>}
          </div>
          {inv.notes && <p className="mb-4 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{inv.notes}</p>}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">P.U. {priceBasis(inv.taxMode)}</th>
                  <th className="text-right">TVA</th>
                  <th className="text-right">Total {priceBasis(inv.taxMode)}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td className="text-right">{formatQty(it.quantity)}</td>
                    <td className="text-right">{m(it.unitPrice)}</td>
                    <td className="text-right">{formatQty(it.taxRate)} %</td>
                    <td className="text-right">{m(shownLineTotal(it, inv.taxMode))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Total HT</span><span>{m(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span>TVA</span><span>{m(inv.taxTotal)}</span></div>
            <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(inv.total)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Payé</span><span>{m(inv.paidAmount)}</span></div>
            {open && <div className="flex justify-between font-medium text-amber-700"><span>Reste</span><span>{m(inv.total - inv.paidAmount)}</span></div>}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Partager avec le client">
            <ShareInvoice url={publicUrl} number={inv.number} total={m(inv.total)} phone={c?.phone} email={c?.email} companyName={ctx.company.name} />
          </Card>
          {open && inv.saleId && inv.customerId && (
            <Card title="Encaisser le reste">
              <p className="mb-3 text-sm text-slate-600">Cette facture vient d&apos;une vente à crédit : le paiement s&apos;enregistre sur la fiche du client et met cette facture à jour.</p>
              <Link href={`/customers/${inv.customerId}`} className="btn-primary w-full">Ouvrir la fiche client</Link>
            </Card>
          )}
          {canPay && (
            <Card title="Enregistrer un paiement">
              <ActionForm action={invoicePaymentAction.bind(null, inv.id)} className="space-y-3" resetOnSuccess>
                <Field label="Montant" name="amount" inputMode="decimal" defaultValue={inv.total - inv.paidAmount} required />
                <SelectField label="Moyen" name="paymentMethodId" options={methods.map((p) => ({ value: p.id, label: p.label }))} />
                <Field label="Référence" name="reference" />
                <SubmitButton>Enregistrer</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {inv.status !== "cancelled" && can(ctx.permissions, "invoices.cancel") && (
            <Card title="Une erreur sur la facture ?">
              {erreur && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
              {inv.saleId ? (
                <p className="text-sm text-slate-600">
                  Cette facture vient d&apos;une vente de caisse. Pour la corriger, annulez la vente (le stock est remis) puis refaites-la.{" "}
                  <Link href={`/sales/${inv.saleId}`} className="text-brand-700 hover:underline">Ouvrir la vente</Link>
                </p>
              ) : inv.paidAmount > 0 ? (
                <p className="text-sm text-slate-600">Un paiement a déjà été enregistré : annulez la facture avec un motif ci-dessous, puis créez la nouvelle facture.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-600">Reprenez la facture, modifiez-la ; l&apos;ancienne sera annulée automatiquement et gardée dans l&apos;historique.</p>
                  <Link href={`/invoices/new?corrige=${inv.id}`} className="btn-primary w-full">Corriger la facture</Link>
                </>
              )}
            </Card>
          )}
          {inv.status !== "cancelled" && can(ctx.permissions, "invoices.cancel") && (
            <Card title="Annuler la facture">
              <ActionForm action={cancelInvoiceAction.bind(null, inv.id)} className="space-y-3">
                <Field label="Motif" name="reason" required />
                <SubmitButton className="btn-danger">Annuler la facture</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
