import Link from "next/link";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { INVOICE_STATUS } from "@/modules/invoices/labels";
import { listInvoices } from "@/modules/invoices/service";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  const ctx = await requireContext("invoices.view");
  const sp = await searchParams;
  const data = await listInvoices(ctx, { page: Number(sp.page), q: sp.q, status: sp.status });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader title="Factures" actions={can(ctx.permissions, "invoices.create") && <Link href="/invoices/new" className="btn-primary">Nouvelle facture</Link>} />
      <SearchBar q={sp.q} placeholder="N° de facture ou client">
        <select name="status" defaultValue={sp.status ?? ""} className="input sm:w-48">
          <option value="">Tous les statuts</option>
          {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </SearchBar>
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucune facture">Créez une facture depuis une vente ou manuellement.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th className="hidden md:table-cell">Client</th>
                  <th className="text-right">Total</th>
                  <th className="hidden text-right sm:table-cell">Payé</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand-700">{i.number}</Link></td>
                    <td>{formatDate(i.issueDate)}</td>
                    <td className="hidden md:table-cell">{i.customer?.name ?? "Comptoir"}</td>
                    <td className="text-right">{m(i.total)}</td>
                    <td className="hidden text-right sm:table-cell">{m(i.paidAmount)}</td>
                    <td><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge></td>
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
