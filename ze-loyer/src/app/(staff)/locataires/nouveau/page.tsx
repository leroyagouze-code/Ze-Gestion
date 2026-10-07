import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader, TextArea } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { todayISO } from "@/modules/finance/dates";
import { listUnits } from "@/modules/properties/service";
import { createTenantAction } from "../actions";
import { LeaseFields } from "../lease-fields";

export const metadata: Metadata = { title: "Ajouter un locataire" };

export default async function NewTenantPage({ searchParams }: { searchParams: Promise<{ logement?: string }> }) {
  const ctx = await requireStaff("tenant.write");
  const { logement } = await searchParams;
  const free = (await listUnits(ctx)).filter((u) => u.unit.status !== "OCCUPIED");
  return (
    <>
      <PageHeader title="Ajouter un locataire" back={{ href: "/locataires", label: "Mes locataires" }} />
      <ActionForm action={createTenantAction} className="space-y-5">
        <section className="card space-y-4 p-5">
          <h2 className="text-[17px] font-bold">Le locataire</h2>
          <Field label="Nom complet" name="fullName" placeholder="Kossi Mensah" required />
          <Field label="Téléphone" name="phone" type="tel" inputMode="tel" placeholder="90 12 34 56" required />
          <Field label="Email (facultatif)" name="email" type="email" />
          <Field label="N° de pièce d'identité (facultatif)" name="idNumber" />
          <TextArea label="Notes (facultatif)" name="notes" />
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="text-[17px] font-bold">Son logement</h2>
          <LeaseFields
            units={free.map((u) => ({ id: u.unit.id, label: u.unit.label, propertyName: u.propertyName, rentAmount: u.unit.rentAmount, depositAmount: u.unit.depositAmount, status: u.unit.status }))}
            selected={logement}
            today={todayISO()}
            optional
          />
        </section>
        <SubmitButton className="btn-primary w-full">Enregistrer le locataire</SubmitButton>
      </ActionForm>
    </>
  );
}
