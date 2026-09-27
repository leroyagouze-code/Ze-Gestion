import Link from "next/link";
import { parsePeriod, PeriodFilter } from "@/components/period-filter";
import { Badge, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodRange } from "@/modules/dashboard/service";
import { listSales } from "@/modules/sales/service";

export const metadata = { title: "Ventes" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ page?: string; period?: string; from?: string; to?: string }> }) {
  const ctx = await requireContext("sales.view");
  const sp = await searchParams;
  const period = sp.period ? parsePeriod(sp) : null;
  const range = period ? periodRange(period, sp) : undefined;
  const data = await listSales(ctx, { page: Number(sp.page), from: range?.from, to: range?.to });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader title="Ventes" actions={can(ctx.permissions, "sales.create") && <Link href="/pos" className="btn-primary">Nouvelle vente</Link>} />
      <PeriodFilter current={period ?? "custom"} from={sp.from} to={sp.to} />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucune vente" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th className="hidden md:table-cell">Client</th>
                  <th className="hidden lg:table-cell">Vendeur</th>
                  <th className="text-right">Total</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/sales/${s.id}`} className="font-medium hover:text-brand-700">{s.number}</Link></td>
                    <td className="whitespace-nowrap">{formatDate(s.createdAt, true)}</td>
                    <td className="hidden md:table-cell">{s.customerName ?? "Comptoir"}</td>
                    <td className="hidden lg:table-cell">{s.userName ?? "—"}</td>
                    <td className="text-right">{m(s.total)}</td>
                    <td>
                      {s.status === "cancelled" ? <Badge tone="red">Annulée</Badge> : s.dueAmount > 0 ? <Badge tone="amber">Crédit {m(s.dueAmount)}</Badge> : <Badge tone="green">Payée</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ period: sp.period, from: sp.from, to: sp.to }} />
    </>
  );
}
