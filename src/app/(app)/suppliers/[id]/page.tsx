import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getSupplier } from "@/modules/suppliers/service";
import { updateSupplierAction } from "../actions";
import { SupplierForm } from "../supplier-form";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("suppliers.view");
  const { id } = await params;
  const data = await getSupplier(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const s = data.supplier;
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const canCost = can(ctx.permissions, "products.cost");
  return (
    <>
      <PageHeader title={s.name} subtitle={[s.companyName, s.phone, s.email].filter(Boolean).join(" · ") || undefined} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Montant dû" value={m(s.balanceDue)} tone={s.balanceDue > 0 ? "warn" : "default"} />
        <Stat label="Produits fournis" value={data.products.length} />
        <Stat label="Réceptions récentes" value={data.receipts.length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Produits fournis">
            {data.products.length === 0 ? <p className="text-sm text-slate-500">Aucun produit rattaché.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/products/${p.id}`} className="hover:text-brand-700">{p.name}</Link></td>
                        <td className="text-slate-500">{p.sku}</td>
                        {canCost && <td className="text-right">{m(p.purchasePrice)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Historique des entrées de stock">
            {data.receipts.length === 0 ? <p className="text-sm text-slate-500">Aucune entrée.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    {data.receipts.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.createdAt, true)}</td>
                        <td>{r.productName}</td>
                        <td className="text-right">+{formatQty(r.quantity)}</td>
                        <td className="text-slate-500">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        {can(ctx.permissions, "suppliers.edit") && (
          <Card title="Fiche fournisseur">
            <SupplierForm action={updateSupplierAction.bind(null, s.id)} s={s} />
          </Card>
        )}
      </div>
    </>
  );
}
