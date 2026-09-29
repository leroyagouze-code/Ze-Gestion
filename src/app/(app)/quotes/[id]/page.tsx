import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { ShareInvoice } from "@/components/share-invoice";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty, priceBasis, shownLineTotal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { QUOTE_STATUS } from "@/modules/quotes/labels";
import { getQuote } from "@/modules/quotes/service";
import { convertQuoteAction, quoteStatusAction } from "../actions";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const ctx = await requireContext("quotes.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { quote: q, items, invoiceNumber, displayStatus } = await getQuote(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const st = QUOTE_STATUS[displayStatus];
  const publicUrl = `${process.env.APP_URL ?? ""}/proforma/${q.publicToken}`;
  const canEdit = can(ctx.permissions, "quotes.create");
  const expired = displayStatus === "expired";
  const editable = canEdit && q.status !== "accepted" && q.status !== "converted";
  const canConvert = canEdit && can(ctx.permissions, "invoices.create") && (q.status === "accepted" || (q.status === "sent" && !expired));
  const c = q.customerSnapshot;
  const statusButton = (to: "sent" | "accepted" | "refused" | "reopen", label: string, cls = "btn-secondary w-full") => (
    <form action={quoteStatusAction.bind(null, q.id, to)}>
      <button className={cls}>{label}</button>
    </form>
  );
  return (
    <>
      <PageHeader
        title={`Proforma ${q.number}`}
        subtitle={`Émise le ${formatDate(q.issueDate)} · valable jusqu'au ${formatDate(q.validUntil)}${q.revision > 1 ? ` · révision ${q.revision}` : ""}`}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {editable && <Link href={`/quotes/${q.id}/edit`} className="btn-secondary">Modifier</Link>}
            <a href={`/api/quotes/${q.id}/pdf`} target="_blank" className="btn-primary">Télécharger le PDF</a>
          </>
        }
      />
      {erreur && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Détail" className="xl:col-span-2">
          <div className="mb-4 text-sm">
            <div className="text-slate-500">Client</div>
            {q.customerId ? <Link href={`/customers/${q.customerId}`} className="font-medium text-brand-700">{c?.name}</Link> : <div className="font-medium">{c?.name ?? "—"}</div>}
          </div>
          {q.notes && <p className="mb-4 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{q.notes}</p>}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">P.U. {priceBasis(q.taxMode)}</th>
                  <th className="text-right">TVA</th>
                  <th className="text-right">Total {priceBasis(q.taxMode)}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td className="text-right">{formatQty(it.quantity)}</td>
                    <td className="text-right">{m(it.unitPrice)}</td>
                    <td className="text-right">{formatQty(it.taxRate)} %</td>
                    <td className="text-right">{m(shownLineTotal(it, q.taxMode))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            {q.discountTotal > 0 && <div className="flex justify-between text-slate-500"><span>Remise</span><span>−{m(q.discountTotal)}</span></div>}
            <div className="flex justify-between"><span>Total HT</span><span>{m(q.subtotal)}</span></div>
            <div className="flex justify-between"><span>TVA</span><span>{m(q.taxTotal)}</span></div>
            <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(q.total)}</span></div>
          </div>
          {q.conditions && <p className="mt-4 text-sm text-slate-600">Conditions : {q.conditions}</p>}
        </Card>
        <div className="space-y-4">
          {q.status === "converted" && (
            <Card title="Facture">
              <p className="mb-3 text-sm text-slate-600">Cette proforma a été convertie en facture{invoiceNumber ? ` ${invoiceNumber}` : ""}.</p>
              {q.convertedInvoiceId && <Link href={`/invoices/${q.convertedInvoiceId}`} className="btn-primary w-full">Ouvrir la facture</Link>}
            </Card>
          )}
          {canConvert && (
            <Card title="Le client a validé ?">
              <p className="mb-3 text-sm text-slate-600">
                Créez la facture en un clic : même client, mêmes lignes, même remise. La facture suit ensuite les règles habituelles (numérotation, créance client).
              </p>
              <form action={convertQuoteAction.bind(null, q.id)}>
                <ConfirmButton className="btn-primary w-full" message={`Créer la facture à partir de la proforma ${q.number} ?`}>Convertir en facture</ConfirmButton>
              </form>
            </Card>
          )}
          {canEdit && q.status !== "converted" && (
            <Card title="Suivi">
              <div className="space-y-2">
                {q.status === "draft" && statusButton("sent", "Marquer comme envoyée")}
                {q.status === "refused" && statusButton("sent", "Renvoyée au client")}
                {(q.status === "draft" || q.status === "sent") && !expired && statusButton("accepted", "Acceptée par le client")}
                {(q.status === "draft" || q.status === "sent") && statusButton("refused", "Refusée par le client")}
                {q.status === "accepted" && statusButton("reopen", "Rouvrir pour modification")}
                {expired && <p className="text-sm text-amber-700">Validité dépassée : modifiez la proforma pour prolonger sa date de validité.</p>}
              </div>
            </Card>
          )}
          <Card title="Partager avec le client">
            <ShareInvoice url={publicUrl} number={q.number} total={m(q.total)} phone={c?.phone} email={c?.email} companyName={ctx.company.name} docLabel="facture proforma" />
          </Card>
        </div>
      </div>
    </>
  );
}
