import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty, priceBasis, shownLineTotal, vatDetail } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getSale } from "@/modules/sales/service";
import { cancelSaleAction, invoiceFromSaleAction } from "../actions";

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("sales.view");
  const { id } = await params;
  const d = await getSale(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const s = d.sale;
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const showProfit = can(ctx.permissions, "reports.profit");
  return (
    <>
      <PageHeader
        title={`Vente ${s.number}`}
        subtitle={`${formatDate(s.createdAt, true)} · ${d.storeName} · ${d.userName ?? "—"}`}
        actions={
          <>
            {s.status === "cancelled" ? <Badge tone="red">Annulée</Badge> : s.dueAmount > 0 ? <Badge tone="amber">Crédit</Badge> : <Badge tone="green">Payée</Badge>}
            <a href={`/api/sales/${s.id}/receipt`} target="_blank" className="btn-secondary">Ticket</a>
            {d.invoice ? (
              <Link href={`/invoices/${d.invoice.id}`} className="btn-secondary">Facture {d.invoice.number}</Link>
            ) : (
              s.status !== "cancelled" &&
              can(ctx.permissions, "invoices.create") && (
                <form action={invoiceFromSaleAction.bind(null, s.id)}>
                  <button className="btn-primary">Créer la facture</button>
                </form>
              )
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Articles" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">P.U. {priceBasis(s.taxMode)}</th>
                  <th className="text-right">Remise</th>
                  <th className="text-right">Total {priceBasis(s.taxMode)}</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.productId ? <Link href={`/products/${it.productId}`} className="hover:text-brand-700">{it.name}</Link> : it.name}</td>
                    <td className="text-right">{formatQty(it.quantity)}</td>
                    <td className="text-right">{m(it.unitPrice)}</td>
                    <td className="text-right">{it.discount ? m(it.discount) : "—"}</td>
                    <td className="text-right">{m(shownLineTotal(it))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Total HT</span><span>{m(s.subtotal)}</span></div>
            <div className="flex justify-between"><span>TVA</span><span>{m(s.taxTotal)}</span></div>
            {vatDetail(d.items, s, ctx.company.currency).map((v) => (
              <div key={v.rate} className="flex justify-between text-slate-500"><span>dont {formatQty(v.rate)} % sur {m(v.base)}</span><span>{m(v.tax)}</span></div>
            ))}
            {s.discountTotal > 0 && <div className="flex justify-between"><span>Remises</span><span>−{m(s.discountTotal)}</span></div>}
            {s.promoCode && <div className="flex justify-between text-emerald-700"><span>dont code promo <span className="font-mono">{s.promoCode}</span></span><span>−{m(s.promoDiscount)}</span></div>}
            <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(s.total)}</span></div>
            {showProfit && <div className="flex justify-between text-slate-500"><span>Marge brute</span><span>{m(s.subtotal - s.costTotal)}</span></div>}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Client">
            {d.customer ? <Link href={`/customers/${d.customer.id}`} className="font-medium text-brand-700">{d.customer.name}</Link> : <p className="text-sm text-slate-500">Client comptoir</p>}
          </Card>
          <Card title="Paiements">
            {d.payments.length === 0 && <p className="text-sm text-slate-500">Aucun paiement.</p>}
            <ul className="space-y-1 text-sm">
              {d.payments.map((p) => (
                <li key={p.id} className="flex justify-between"><span>{p.method}{p.reference ? ` (${p.reference})` : ""}</span><span>{m(p.amount)}</span></li>
              ))}
            </ul>
            {s.dueAmount > 0 && <p className="mt-2 text-sm font-medium text-amber-700">Reste dû : {m(s.dueAmount)}</p>}
          </Card>
          {s.status !== "cancelled" && can(ctx.permissions, "sales.cancel") && (
            <Card title="Annuler la vente">
              <ActionForm action={cancelSaleAction.bind(null, s.id)} className="space-y-3">
                <Field label="Motif" name="reason" required />
                <SubmitButton className="btn-danger">Annuler et remettre en stock</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
