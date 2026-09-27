import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { canAny } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Nouveau client" };

export default async function NewCustomerPage() {
  const ctx = await requireContext();
  if (!canAny(ctx.permissions, "customers.create", "customers.edit")) redirect("/forbidden");
  return (
    <>
      <PageHeader title="Nouveau client" />
      <div className="card p-4 sm:p-6">
        <CustomerForm action={createCustomerAction} />
      </div>
    </>
  );
}
