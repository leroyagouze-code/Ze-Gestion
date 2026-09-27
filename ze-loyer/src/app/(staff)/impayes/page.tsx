import type { Metadata } from "next";
import { Card, EmptyState, Money, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { arrearsOf, scopedLedgerRows } from "@/modules/dashboard/service";
import { ArrearsList } from "./arrears-list";

export const metadata: Metadata = { title: "Impayés" };

export default async function ArrearsPage() {
  const ctx = await requireStaff("payment.read");
  const arrears = arrearsOf(await scopedLedgerRows(ctx));
  const total = arrears.reduce((s, a) => s + a.debt, 0);
  return (
    <>
      <PageHeader title="🔴 Impayés" subtitle="Qui me doit de l'argent ?" />
      {arrears.length > 0 && (
        <div className="card mb-4 flex items-center justify-between border-red-200 bg-red-50 p-4">
          <span className="text-[15px] font-semibold text-red-900">
            {arrears.length} locataire{arrears.length > 1 ? "s" : ""} en retard
          </span>
          <Money value={total} className="text-2xl font-extrabold text-red-800" />
        </div>
      )}
      <Card padded={false}>
        {arrears.length ? (
          <ArrearsList items={arrears} canPay={can(ctx.permissions, "payment.write")} />
        ) : (
          <EmptyState icon="🟢" title="Aucun impayé">
            Tous vos locataires sont à jour. Bravo !
          </EmptyState>
        )}
      </Card>
    </>
  );
}
