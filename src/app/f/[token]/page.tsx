import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty, priceBasis, shownLineTotal, vatDetail } from "@/lib/money";
import { INVOICE_STATUS } from "@/modules/invoices/labels";
import { getPublicInvoice } from "@/modules/invoices/service";

export const metadata: Metadata = { title: "Facture", robots: { index: false, follow: false } };

/** Page publique de consultation, accessible uniquement avec le jeton secret du lien. */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicInvoice(token);
  if (!data) notFound();
  const { company: co, invoice: inv, items } = data;
  const m = (v: number) => formatMoney(v, co.currency);
  const st = INVOICE_STATUS[inv.status];
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="card overflow-hidden">
        <div className="h-2" style={{ background: co.brandColor }} />
        <div className="p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              {co.logoUrl && <img src={co.logoUrl} alt={co.name} className="mb-2 h-14 object-contain" />}
              <div className="text-lg font-semibold">{co.name}</div>
              <div className="text-sm text-slate-500">{[co.address, co.city].filter(Boolean).join(", ")}</div>
              <div className="text-sm text-slate-500">{[co.phone, co.email].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-2xl font-bold" style={{ color: co.brandColor }}>FACTURE</div>
              <div className="font-medium">{inv.number}</div>
              <div className="text-sm text-slate-500">Émise le {formatDate(inv.issueDate)}</div>
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{st.label}</span>
            </div>
          </div>
          <div className="mt-6 text-sm">
            <div className="text-slate-500">Client</div>
            <div className="font-medium">{inv.customerSnapshot?.name ?? "Client comptoir"}</div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Désignation</th><th className="text-right">Qté</th><th className="text-right">P.U. {priceBasis(inv.taxMode)}</th><th className="text-right">Total {priceBasis(inv.taxMode)}</th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}><td>{it.description}</td><td className="text-right">{formatQty(it.quantity)}</td><td className="text-right">{m(it.unitPrice)}</td><td className="text-right">{m(shownLineTotal(it))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Total HT</span><span>{m(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span>TVA</span><span>{m(inv.taxTotal)}</span></div>
            {vatDetail(items, inv, co.currency).map((v) => (
              <div key={v.rate} className="flex justify-between text-slate-500"><span>dont {formatQty(v.rate)} % sur {m(v.base)}</span><span>{m(v.tax)}</span></div>
            ))}
            <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(inv.total)}</span></div>
            {inv.status !== "cancelled" && inv.total > inv.paidAmount && <div className="flex justify-between font-medium text-amber-700"><span>Reste à payer</span><span>{m(inv.total - inv.paidAmount)}</span></div>}
          </div>
          {co.bankInfo && <p className="mt-6 text-sm text-slate-600">Coordonnées bancaires : {co.bankInfo}</p>}
          <a href={`/api/f/${token}/pdf`} className="btn-primary mt-6">Télécharger le PDF</a>
        </div>
      </div>
      {co.invoiceFooter && <p className="mt-4 text-center text-xs text-slate-500">{co.invoiceFooter}</p>}
    </div>
  );
}
