import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { getScopedProperty } from "@/modules/access";
import { listOwners } from "@/modules/tenants/service";
import { updatePropertyAction } from "../../actions";
import { PropertyForm } from "../../property-form";

export const metadata: Metadata = { title: "Modifier le bien" };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("property.write");
  const { id } = await params;
  const p = await found(getScopedProperty(ctx, id));
  const owners = (await listOwners(ctx)).map((o) => ({ id: o.owner.id, name: o.owner.fullName }));
  return (
    <>
      <PageHeader title="Modifier le bien" back={{ href: `/biens/${id}`, label: p.name }} />
      <PropertyForm action={updatePropertyAction.bind(null, id)} owners={owners} defaults={p} submitLabel="Enregistrer" />
    </>
  );
}
