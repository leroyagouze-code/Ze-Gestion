import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty, priceBasis, shownLineTotal } from "@/lib/money";
import { PROFORMA_NOTICE, QUOTE_STATUS } from "@/modules/quotes/labels";
import { getPublicQuote } from "@/modules/quotes/service";

export const metadata: Metadata = { title: "Facture proforma", robots: { index: false, follow: false } };

/** Page publique de consultation d'une proforma, accessible uniquement avec le jeton secret du lien. */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicQuote(token);
  if (!data) notFound();
  const { company: co, quote: q, items, displayStatus } = data;
  const m = (v: number) => formatMoney(v, co.currency);
  const st = QUOTE_STATUS[displayStatus];
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
              <div className="text-2xl font-bold" style={{ color: co.brandColor }}>FACTURE PROFORMA</div>
              <div className="font-medium">{q.number}{q.revision > 1 && <span className="text-slate-500"> · Révision {q.revision}</span>}</div>
              <div className="text-sm text-slate-500">Émise le {formatDate(q.issueDate)}</div>
              <div className="text-sm text-slate-500">Valable jusqu&apos;au {formatDate(q.validUntil)}</div>
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{st.label}</span>
            </div>
          </div>
          <div className="mt-6 text-sm">
            <div className="text-slate-500">Client</div>
            <div className="font-medium">{q.customerSnapshot?.name ?? "—"}</div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Désignation</th><th className="text-right">Qté</th><th className="text-right">P.U. {priceBasis(q.taxMode)}</th><th className="text-right">Total {priceBasis(q.taxMode)}</th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}><td>{it.description}</td><td className="text-right">{formatQty(it.quantity)}</td><td className="text-right">{m(it.unitPrice)}</td><td className="text-right">{m(shownLineTotal(it, q.taxMode))}</td></tr>
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
          {q.conditions && <p className="mt-6 text-sm text-slate-600">Conditions : {q.conditions}</p>}
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{PROFORMA_NOTICE}</p>
          <a href={`/api/proforma/${token}/pdf`} className="btn-primary mt-6">Télécharger le PDF</a>
        </div>
      </div>
      {co.invoiceFooter && <p className="mt-4 text-center text-xs text-slate-500">{co.invoiceFooter}</p>}
    </div>
  );
}
