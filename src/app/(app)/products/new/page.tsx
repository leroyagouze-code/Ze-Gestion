import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { productFormOptions } from "@/modules/products/service";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const metadata = { title: "Nouveau produit" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const ctx = await requireContext("products.edit");
  const { created } = await searchParams;
  const options = await productFormOptions(ctx);
  return (
    <>
      <PageHeader title="Nouveau produit" />
      {created && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Produit créé. Vous pouvez en ajouter un autre.</p>}
      <div className="card p-4 sm:p-6">
        <ProductForm action={createProductAction} options={options} canCost={can(ctx.permissions, "products.cost")} isNew taxMode={ctx.company.taxMode} />
      </div>
    </>
  );
}
