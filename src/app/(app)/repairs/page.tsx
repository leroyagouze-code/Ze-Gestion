import Link from "next/link";
import clsx from "clsx";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listRepairOrders, REPAIR_STATUS } from "@/modules/repairs/service";

export const metadata = { title: "Réparations" };

const FILTERS = [
  { key: "", label: "En atelier" },
  { key: "done", label: "Terminés" },
  { key: "invoiced", label: "Facturés" },
  { key: "cancelled", label: "Annulés" },
  { key: "all", label: "Tous" },
];

export default async function RepairsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await requireContext("sales.view");
  const sp = await searchParams;
  const data = await listRepairOrders(ctx, { q: sp.q, status: sp.status, page: Number(sp.page) });
  return (
    <>
      <PageHeader
        title="Réparations"
        subtitle="Ordres de réparation : véhicule, pièces posées et main-d'œuvre, puis facture."
        actions={can(ctx.permissions, "sales.create") && <Link href="/repairs/new" className="btn-primary">Nouvel ordre</Link>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/repairs?status=${f.key}` : "/repairs"}
            className={clsx("rounded-full px-3 py-1 text-sm", (sp.status ?? "") === f.key ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <SearchBar q={sp.q} placeholder="Immatriculation, client, n° d'ordre…">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
      </SearchBar>
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucun ordre de réparation">
            <Link href="/repairs/new" className="text-brand-700">Ouvrir un ordre pour un véhicule</Link>
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Véhicule</th>
                  <th className="hidden md:table-cell">Client</th>
                  <th className="hidden lg:table-cell">Demande</th>
                  <th>État</th>
                  <th className="text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/repairs/${r.id}`} className="font-medium text-brand-700">{r.number}</Link>
                      <div className="text-xs text-slate-500">{formatDate(r.createdAt)}</div>
                    </td>
                    <td>
                      <span className="font-mono font-medium">{r.plate}</span>
                      <div className="text-xs text-slate-500">{r.vehicle}</div>
                    </td>
                    <td className="hidden md:table-cell">{r.customer}</td>
                    <td className="hidden max-w-xs truncate text-slate-500 lg:table-cell">{r.complaint ?? "—"}</td>
                    <td>
                      <Badge tone={REPAIR_STATUS[r.status].tone}>{REPAIR_STATUS[r.status].label}</Badge>
                      {r.promisedAt && r.status !== "invoiced" && <div className="text-xs text-slate-500">Promis le {formatDate(r.promisedAt)}</div>}
                    </td>
                    <td className="text-right">{formatMoney(r.total, ctx.company.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
