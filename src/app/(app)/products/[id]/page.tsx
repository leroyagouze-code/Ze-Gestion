import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getProduct, productFormOptions } from "@/modules/products/service";
import { listMovements, receiptFormOptions } from "@/modules/stock/service";
import { MOVEMENT_LABELS } from "@/modules/stock/labels";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";
import { MovementForm } from "../../stock/movement-form";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("products.view");
  const { id } = await params;
  const data = await getProduct(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canEdit = can(ctx.permissions, "products.edit");
  const canStock = can(ctx.permissions, "stock.view");
  const canAdjust = can(ctx.permissions, "stock.adjust");
  const canCost = can(ctx.permissions, "products.cost");
  const [options, movements, receiptSuppliers] = await Promise.all([
    canEdit ? productFormOptions(ctx) : null,
    canStock ? listMovements(ctx, { productId: id }) : null,
    canAdjust ? receiptFormOptions(ctx) : null,
  ]);
  const p = data.product;
  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={[p.sku && `SKU ${p.sku}`, p.barcode && `Code ${p.barcode}`].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Badge tone={data.stock <= 0 ? "red" : data.stock <= p.minStock ? "amber" : "green"}>
              Stock : {formatQty(data.stock)} {p.unit}
            </Badge>
            {can(ctx.permissions, "products.delete") && (
              <form action={deleteProductAction.bind(null, id)}>
                <ConfirmButton message="Supprimer cet article ? Il disparaît du catalogue et de la caisse." className="btn-ghost text-red-600">Supprimer</ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {options ? (
            <Card title="Fiche produit">
              {p.imageUrl && <img src={p.imageUrl} alt="" className="mb-4 h-28 w-28 rounded-lg object-cover ring-1 ring-slate-200" />}
              <ProductForm
                taxMode={ctx.company.taxMode}
                action={updateProductAction.bind(null, id)}
                options={options}
                product={p}
                categoryName={data.categoryName}
                brandName={data.brandName}
                canCost={can(ctx.permissions, "products.cost")}
              />
            </Card>
          ) : (
            <Card title="Fiche produit">
              <p className="text-sm text-slate-600">{p.description || "Pas de description."}</p>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {canAdjust && (
            <Card title="Mouvement de stock">
              <MovementForm productId={id} suppliers={receiptSuppliers ?? []} canCost={canCost} currentCost={canCost ? p.purchasePrice : undefined} />
            </Card>
          )}
          {movements && (
            <Card title="Historique du stock" actions={<Link href={`/stock/movements?productId=${id}`} className="text-sm text-brand-700">Tout voir</Link>}>
              {movements.rows.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun mouvement.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {movements.rows.slice(0, 15).map((mv) => (
                    <li key={mv.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="font-medium">{MOVEMENT_LABELS[mv.type]}</div>
                        <div className="text-xs text-slate-500">
                          {formatDate(mv.createdAt, true)} · {mv.userName ?? "—"} {mv.reason && `· ${mv.reason}`}
                        </div>
                        {(mv.supplierName || mv.unitCost != null) && (
                          <div className="text-xs text-slate-500">
                            {[mv.supplierName, mv.unitCost != null && `${formatMoney(mv.unitCost, ctx.company.currency)} / u`].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={mv.quantity >= 0 ? "text-emerald-700" : "text-red-600"}>
                          {mv.quantity > 0 ? "+" : ""}
                          {formatQty(mv.quantity)}
                        </div>
                        <div className="text-xs text-slate-500">→ {formatQty(mv.quantityAfter)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
