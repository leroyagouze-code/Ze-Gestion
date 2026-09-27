import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getProduct, productFormOptions } from "@/modules/products/service";
import { listMovements } from "@/modules/stock/service";
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
  const [options, movements] = await Promise.all([
    canEdit ? productFormOptions(ctx) : null,
    canStock ? listMovements(ctx, { productId: id }) : null,
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
                <button className="btn-ghost text-red-600">Supprimer</button>
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
          {can(ctx.permissions, "stock.adjust") && (
            <Card title="Mouvement de stock">
              <MovementForm productId={id} />
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
