import Link from "next/link";
import { EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { MOVEMENT_LABELS } from "@/modules/stock/labels";
import { listMovements } from "@/modules/stock/service";

export const metadata = { title: "Mouvements de stock" };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ page?: string; productId?: string }> }) {
  const ctx = await requireContext("stock.view");
  const sp = await searchParams;
  const data = await listMovements(ctx, { page: Number(sp.page), productId: sp.productId });
  const canCost = can(ctx.permissions, "products.cost");
  return (
    <>
      <PageHeader title="Mouvements de stock" />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucun mouvement" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Type</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Après</th>
                  {canCost && <th className="hidden text-right sm:table-cell">Prix d'achat unit.</th>}
                  <th className="hidden sm:table-cell">Fournisseur</th>
                  <th className="hidden md:table-cell">Utilisateur</th>
                  <th className="hidden md:table-cell">Motif</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatDate(m.createdAt, true)}</td>
                    <td><Link href={`/products/${m.productId}`} className="hover:text-brand-700">{m.productName}</Link></td>
                    <td>{MOVEMENT_LABELS[m.type]}</td>
                    <td className={`text-right ${m.quantity >= 0 ? "text-emerald-700" : "text-red-600"}`}>{m.quantity > 0 ? "+" : ""}{formatQty(m.quantity)}</td>
                    <td className="text-right">{formatQty(m.quantityAfter)}</td>
                    {canCost && <td className="hidden text-right sm:table-cell">{m.unitCost != null ? formatMoney(m.unitCost, ctx.company.currency) : ""}</td>}
                    <td className="hidden sm:table-cell">
                      {m.supplierId ? <Link href={`/suppliers/${m.supplierId}`} className="hover:text-brand-700">{m.supplierName}</Link> : ""}
                    </td>
                    <td className="hidden md:table-cell">{m.userName ?? "—"}</td>
                    <td className="hidden text-slate-500 md:table-cell">{m.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} params={{ productId: sp.productId }} />
    </>
  );
}
