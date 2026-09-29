import Link from "next/link";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { QUOTE_STATUS } from "@/modules/quotes/labels";
import { listQuotes } from "@/modules/quotes/service";

export const metadata = { title: "Proformas" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  const ctx = await requireContext("quotes.view");
  const sp = await searchParams;
  const data = await listQuotes(ctx, { page: Number(sp.page), q: sp.q, status: sp.status });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader
        title="Proformas"
        subtitle="Factures proforma (devis) : modifiables à la demande du client, puis converties en facture une fois validées."
        actions={can(ctx.permissions, "quotes.create") && <Link href="/quotes/new" className="btn-primary">Nouvelle proforma</Link>}
      />
      <SearchBar q={sp.q} placeholder="N° de proforma ou client">
        <select name="status" defaultValue={sp.status ?? ""} className="input sm:w-48">
          <option value="">Tous les statuts</option>
          {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </SearchBar>
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucune proforma">Créez une proforma pour chiffrer une demande client avant de facturer.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th className="hidden sm:table-cell">Valable jusqu&apos;au</th>
                  <th className="hidden md:table-cell">Client</th>
                  <th className="text-right">Total</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/quotes/${q.id}`} className="font-medium hover:text-brand-700">{q.number}</Link>
                      {q.revision > 1 && <span className="ml-1 text-xs text-slate-500">rév. {q.revision}</span>}
                    </td>
                    <td>{formatDate(q.issueDate)}</td>
                    <td className="hidden sm:table-cell">{formatDate(q.validUntil)}</td>
                    <td className="hidden md:table-cell">{q.customer?.name ?? "—"}</td>
                    <td className="text-right">{m(q.total)}</td>
                    <td><Badge tone={QUOTE_STATUS[q.displayStatus].tone}>{QUOTE_STATUS[q.displayStatus].label}</Badge></td>
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
