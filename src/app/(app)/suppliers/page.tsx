import Link from "next/link";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listSuppliers } from "@/modules/suppliers/service";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireContext("suppliers.view");
  const sp = await searchParams;
  const data = await listSuppliers(ctx, { q: sp.q, page: Number(sp.page) });
  return (
    <>
      <PageHeader title="Fournisseurs" actions={can(ctx.permissions, "suppliers.edit") && <Link href="/suppliers/new" className="btn-primary">Nouveau fournisseur</Link>} />
      <SearchBar q={sp.q} placeholder="Nom, téléphone" />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucun fournisseur" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th className="hidden sm:table-cell">Téléphone</th>
                  <th className="text-right">Produits</th>
                  <th className="text-right">Montant dû</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/suppliers/${s.id}`} className="font-medium hover:text-brand-700">{s.name}</Link>
                      {s.companyName && <div className="text-xs text-slate-500">{s.companyName}</div>}
                    </td>
                    <td className="hidden sm:table-cell">{s.phone ?? "—"}</td>
                    <td className="text-right">{s.productCount}</td>
                    <td className="text-right">{s.balanceDue > 0 ? <Badge tone="amber">{formatMoney(s.balanceDue, ctx.company.currency)}</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ q: sp.q }} />
    </>
  );
}
