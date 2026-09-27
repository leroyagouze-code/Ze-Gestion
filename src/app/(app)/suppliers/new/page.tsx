import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { createSupplierAction } from "../actions";
import { SupplierForm } from "../supplier-form";

export const metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplierPage() {
  await requireContext("suppliers.edit");
  return (
    <>
      <PageHeader title="Nouveau fournisseur" />
      <div className="card p-4 sm:p-6">
        <SupplierForm action={createSupplierAction} />
      </div>
    </>
  );
}
