import Link from "next/link";
import type { Metadata } from "next";
import { HistoryList, SituationPanel } from "@/components/carnet";
import { Badge, Card, Money, PageHeader } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { shortDate } from "@/modules/finance/dates";
import { DEPOSIT_STATUS_LABELS, METHOD_LABELS, TYPE_LABELS } from "@/modules/finance/labels";
import { tenantOverview } from "@/modules/portal/service";
import { NoLease } from "../no-lease";

export const metadata: Metadata = { title: "Mon carnet" };

export default async function CarnetPage() {
  const ctx = await requireTenant();
  const o = await tenantOverview(ctx.userId);
  if (!o.current || !o.situation) return <NoLease phone={ctx.phone} />;
  const { lease, unit, property } = o.current;
  return (
    <div className="space-y-5">
      <PageHeader title="📒 Mon carnet" subtitle={`${unit.label} · ${property.name}`} />
      <SituationPanel s={o.situation} rent={lease.rentAmount} />

      <Card title="Historique" padded={false}>
        <HistoryList s={o.situation} />
      </Card>

      <Card title="Mes paiements" padded={false}>
        {o.payments.length ? (
          <ul className="divide-y divide-sand-100">
            {o.payments.map((p) => (
              <li key={p.payment.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {TYPE_LABELS[p.payment.type]} · {shortDate(p.payment.paidAt)}
                    </p>
                    <p className="text-[14px] text-stone-600">{METHOD_LABELS[p.payment.method]}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money value={p.payment.amount} className={p.payment.status === "CANCELLED" ? "font-bold text-stone-400 line-through" : "font-bold"} />
                    {p.payment.status === "CANCELLED" && <Badge tone="gray">Annulé</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[14px]">
                  {p.receiptId && p.payment.status === "VALID" && (
                    <a href={`/api/quittances/${p.receiptId}/pdf`} target="_blank" className="font-semibold text-brand-700 underline">
                      🧾 Quittance
                    </a>
                  )}
                  <Link href={`/mon-espace/signaler?paiement=${p.payment.id}`} className="font-semibold text-stone-600 underline">
                    Signaler une erreur
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-[15px] text-stone-600">Aucun paiement enregistré.</p>
        )}
      </Card>

      {o.deposits.length > 0 && (
        <Card title="🔐 Ma caution">
          {o.deposits.map((d) => (
            <div key={d.id} className="flex items-center justify-between">
              <div>
                <Money value={d.amount} className="text-lg font-bold" />
                <p className="text-[14px] text-stone-600">Versée le {shortDate(d.depositedAt)}</p>
                {d.status !== "DEPOSITED" && (
                  <p className="text-[14px] text-stone-700">
                    Remboursé <Money value={d.refundedAmount} /> · retenu <Money value={d.retainedAmount} />
                    {d.comment ? ` — ${d.comment}` : ""}
                  </p>
                )}
              </div>
              <Badge tone={d.status === "DEPOSITED" ? "blue" : "green"}>{DEPOSIT_STATUS_LABELS[d.status]}</Badge>
            </div>
          ))}
        </Card>
      )}

      <div className="card p-4 text-center">
        <p className="text-[15px] text-stone-700">Une information vous semble fausse ?</p>
        <Link href="/mon-espace/signaler" className="btn-secondary mt-3">
          ⚠️ Signaler une erreur
        </Link>
      </div>
    </div>
  );
}
