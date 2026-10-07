import Link from "next/link";
import { Money } from "@/components/ui";
import { RemindButton } from "./remind-button";

export type ArrearsItem = { leaseId: string; tenantId: string; tenantName: string; unitLabel: string; propertyName: string; debt: number; daysLate: number };

/** Liste des impayés : lisible sur mobile (cartes), avec Voir / Relancer / Enregistrer un paiement. */
export function ArrearsList({ items, canPay }: { items: ArrearsItem[]; canPay: boolean }) {
  return (
    <ul className="divide-y divide-sand-100">
      {items.map((a) => (
        <li key={a.leaseId} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold">{a.tenantName}</p>
              <p className="truncate text-[14px] text-stone-600">
                {a.unitLabel} · {a.propertyName}
              </p>
            </div>
            <div className="text-right">
              <Money value={a.debt} className="text-[18px] font-bold text-red-800" />
              <p className="text-[13px] font-semibold text-red-700">
                {a.daysLate} jour{a.daysLate > 1 ? "s" : ""} de retard
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Link href={`/locations/${a.leaseId}`} className="btn-secondary btn-sm">
              Voir
            </Link>
            {canPay && <RemindButton leaseId={a.leaseId} />}
            {canPay && (
              <Link href={`/paiements/nouveau?location=${a.leaseId}`} className="btn-primary btn-sm col-span-2 sm:col-span-1">
                Enregistrer un paiement
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
