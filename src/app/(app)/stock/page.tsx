import Link from "next/link";
import { getTrade } from "@/lib/trades";
import clsx from "clsx";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listStock } from "@/modules/stock/service";

export const metadata = { title: "Stock" };

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "low", label: "Stock faible" },
  { key: "out", label: "Rupture" },
] as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; filter?: "all" | "low" | "out" }> }) {
  const ctx = await requireContext("stock.view");
  const item = getTrade(ctx.company.businessType).item;
  const sp = await searchParams;
  const filter = sp.filter ?? "all";
  const data = await listStock(ctx, { q: sp.q, filter, page: Number(sp.page) });
  const canCost = can(ctx.permissions, "products.cost");
  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Boutique courante"
        actions={
          <>
            <Link href="/stock/movements" className="btn-secondary">Historique des mouvements</Link>
            {can(ctx.permissions, "data.export") && <a href="/api/export/stock" className="btn-secondary">Exporter CSV</a>}
          </>
        }
      />
      <div className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`?filter=${f.key}`} className={clsx("btn px-3 py-1.5", filter === f.key ? "bg-brand-700 text-white" : "btn-secondary")}>
            {f.label}
          </Link>
        ))}
      </div>
      <SearchBar q={sp.q} placeholder={`${item.one.charAt(0).toUpperCase() + item.one.slice(1)}, SKU, code-barres`}>
        <input type="hidden" name="filter" value={filter} />
      </SearchBar>
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title={`Aucun ${item.one}`} />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>{item.one.charAt(0).toUpperCase() + item.one.slice(1)}</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Minimum</th>
                  {canCost && <th className="hidden text-right sm:table-cell">Valeur</th>}
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/products/${r.id}`} className="font-medium hover:text-brand-700">{r.name}</Link>
                      {r.sku && <div className="text-xs text-slate-500">{r.sku}</div>}
                    </td>
                    <td className="text-right">{formatQty(r.quantity)} {r.unit}</td>
                    <td className="text-right text-slate-500">{formatQty(r.minStock)}</td>
                    {canCost && <td className="hidden text-right sm:table-cell">{formatMoney(Math.max(r.quantity, 0) * r.purchasePrice, ctx.company.currency)}</td>}
                    <td>
                      {r.quantity <= 0 ? <Badge tone="red">Rupture</Badge> : r.quantity <= r.minStock ? <Badge tone="amber">Faible</Badge> : <Badge tone="green">OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ q: sp.q, filter }} />
    </>
  );
}
