import type { Metadata } from "next";
import { Badge, Card, EmptyState, Money, PageHeader } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { shortDate } from "@/modules/finance/dates";
import { tenantOverview } from "@/modules/portal/service";
import { NoLease } from "../no-lease";

export const metadata: Metadata = { title: "Mes quittances" };

export default async function ReceiptsPage() {
  const ctx = await requireTenant();
  const o = await tenantOverview(ctx.userId);
  if (!o.current) return <NoLease phone={ctx.phone} />;
  return (
    <>
      <PageHeader title="🧾 Mes quittances" subtitle="Une quittance est créée à chaque paiement enregistré." />
      <Card padded={false}>
        {o.receipts.length ? (
          <ul className="divide-y divide-sand-100">
            {o.receipts.map((r) => {
              const cancelled = r.paymentStatus === "CANCELLED";
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.periodLabel}</p>
                    <p className="text-[14px] text-stone-600">
                      {r.number} · payé le {shortDate(r.paidAt)}
                    </p>
                    <Money value={r.amount} className={cancelled ? "text-stone-400 line-through" : "font-semibold"} />
                  </div>
                  {cancelled ? (
                    <Badge tone="gray">Annulée</Badge>
                  ) : (
                    <a href={`/api/quittances/${r.id}/pdf`} target="_blank" className="btn-secondary btn-sm shrink-0">
                      Télécharger PDF
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="🧾" title="Pas encore de quittance">Vos quittances apparaîtront ici après chaque paiement.</EmptyState>
        )}
      </Card>
    </>
  );
}
