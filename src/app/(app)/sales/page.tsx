import Link from "next/link";
import { parsePeriod, PeriodFilter } from "@/components/period-filter";
import { Badge, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodRange } from "@/modules/dashboard/service";
import { listRegisters, listSellers, uuidParam } from "@/modules/registers/service";
import { listSales } from "@/modules/sales/service";

export const metadata = { title: "Ventes" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; period?: string; from?: string; to?: string; user?: string; register?: string; session?: string }>;
}) {
  const ctx = await requireContext("sales.view");
  const sp = await searchParams;
  const period = sp.period ? parsePeriod(sp) : null;
  const range = period ? periodRange(period, sp) : undefined;
  const filters = { userId: uuidParam(sp.user), registerId: uuidParam(sp.register), cashSessionId: uuidParam(sp.session) };
  const [data, registers, sellers] = await Promise.all([
    listSales(ctx, { page: Number(sp.page), from: range?.from, to: range?.to, ...filters }),
    listRegisters(ctx),
    listSellers(ctx),
  ]);
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader title="Ventes" actions={can(ctx.permissions, "sales.create") && <Link href="/pos" className="btn-primary">Nouvelle vente</Link>} />
      <PeriodFilter current={period ?? "custom"} from={sp.from} to={sp.to} />
      {(sellers.length > 1 || registers.length > 0) && (
        <form className="-mt-3 mb-4 flex flex-wrap gap-2">
          {sp.period && <input type="hidden" name="period" value={sp.period} />}
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          {sellers.length > 1 && (
            <select name="user" defaultValue={filters.userId ?? ""} className="input w-48" aria-label="Caissier">
              <option value="">Tous les caissiers</option>
              {sellers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {registers.length > 0 && (
            <select name="register" defaultValue={filters.registerId ?? ""} className="input w-48" aria-label="Caisse">
              <option value="">Toutes les caisses</option>
              {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <button className="btn-secondary">Filtrer</button>
          {filters.cashSessionId && <Link href="/sales" className="btn-ghost">Session filtrée · tout afficher</Link>}
        </form>
      )}
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
                  {registers.length > 0 && <th className="hidden lg:table-cell">Caisse</th>}
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
                    {registers.length > 0 && <td className="hidden lg:table-cell">{s.registerName ?? "—"}</td>}
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
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ period: sp.period, from: sp.from, to: sp.to, user: filters.userId, register: filters.registerId, session: filters.cashSessionId }} />
    </>
  );
}
