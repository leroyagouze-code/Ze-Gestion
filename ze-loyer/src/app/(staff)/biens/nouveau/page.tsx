import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { listOwners } from "@/modules/tenants/service";
import { createPropertyAction } from "../actions";
import { PropertyForm } from "../property-form";

export const metadata: Metadata = { title: "Ajouter un bien" };

export default async function NewPropertyPage() {
  const ctx = await requireStaff("property.write");
  const owners = (await listOwners(ctx)).map((o) => ({ id: o.owner.id, name: o.owner.fullName }));
  return (
    <>
      <PageHeader title="Ajouter un bien" back={{ href: "/biens", label: "Mes biens" }} />
      <PropertyForm action={createPropertyAction} owners={owners} submitLabel="Enregistrer le bien" />
    </>
  );
}
