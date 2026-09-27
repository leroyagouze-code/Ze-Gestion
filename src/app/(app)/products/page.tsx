import Link from "next/link";
import { Badge, EmptyState, PageHeader, Pagination, SearchBar, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listProducts } from "@/modules/products/service";

export const metadata = { title: "Produits" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireContext("products.view");
  const sp = await searchParams;
  const data = await listProducts(ctx, { q: sp.q, page: Number(sp.page) });
  const canEdit = can(ctx.permissions, "products.edit");
  const canCost = can(ctx.permissions, "products.cost");
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  return (
    <>
      <PageHeader
        title="Produits"
        actions={
          <>
            {can(ctx.permissions, "data.export") && <a href="/api/export/products" className="btn-secondary">Exporter CSV</a>}
            {canEdit && <Link href="/products/import" className="btn-secondary">Importer</Link>}
            {canEdit && <Link href="/products/new" className="btn-primary">Nouveau produit</Link>}
          </>
        }
      />
      <SearchBar q={sp.q} placeholder="Nom, SKU, code-barres, référence…" />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucun produit">{canEdit && <Link href="/products/new" className="text-brand-700">Ajouter votre premier produit</Link>}</EmptyState>
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="hidden md:table-cell">SKU / code</th>
                  <th className="hidden md:table-cell">Catégorie</th>
                  {canCost && <th className="text-right">Achat</th>}
                  <th className="text-right">Vente</th>
                  <th className="text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">{p.name}</Link>
                    </td>
                    <td className="hidden text-slate-500 md:table-cell">{p.sku || p.barcode || "—"}</td>
                    <td className="hidden text-slate-500 md:table-cell">{p.category ?? "—"}</td>
                    {canCost && <td className="text-right">{p.purchasePrice !== null ? m(p.purchasePrice) : ""}</td>}
                    <td className="text-right">
                      {p.promoPrice ? (
                        <>
                          <span className="mr-1 text-xs text-slate-400 line-through">{m(p.salePrice)}</span>
                          {m(p.promoPrice)}
                        </>
                      ) : (
                        m(p.salePrice)
                      )}
                    </td>
                    <td className="text-right">
                      <Badge tone={p.stock <= 0 ? "red" : p.stock <= p.minStock ? "amber" : "green"}>
                        {formatQty(p.stock)} {p.unit}
                      </Badge>
                    </td>
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
