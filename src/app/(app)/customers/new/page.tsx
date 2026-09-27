import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Nouveau client" };

export default async function NewCustomerPage() {
  await requireContext("customers.edit");
  return (
    <>
      <PageHeader title="Nouveau client" />
      <div className="card p-4 sm:p-6">
        <CustomerForm action={createCustomerAction} />
      </div>
    </>
  );
}
