import Link from "next/link";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listCustomers } from "@/modules/customers/service";

export const metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; debt?: string }> }) {
  const ctx = await requireContext("customers.view");
  const sp = await searchParams;
  const data = await listCustomers(ctx, { q: sp.q, page: Number(sp.page), withDebt: sp.debt === "1" });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <>
            <Link href={sp.debt === "1" ? "/customers" : "?debt=1"} className="btn-secondary">{sp.debt === "1" ? "Tous les clients" : "Clients avec dette"}</Link>
            <a href="/api/export/customers" className="btn-secondary">Exporter CSV</a>
            {can(ctx.permissions, "customers.edit") && <Link href="/customers/new" className="btn-primary">Nouveau client</Link>}
          </>
        }
      />
      <SearchBar q={sp.q} placeholder="Nom, téléphone, entreprise" />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucun client" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="hidden sm:table-cell">Téléphone</th>
                  <th className="text-right">Total dépensé</th>
                  <th className="text-right">Solde dû</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:text-brand-700">{c.name}</Link>
                      {c.companyName && <div className="text-xs text-slate-500">{c.companyName}</div>}
                    </td>
                    <td className="hidden sm:table-cell">{c.phone ?? "—"}</td>
                    <td className="text-right">{m(c.totalSpent)}</td>
                    <td className="text-right">{c.balanceDue > 0 ? <Badge tone="amber">{m(c.balanceDue)}</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ q: sp.q, debt: sp.debt }} />
    </>
  );
}
