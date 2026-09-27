import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader, SelectField, TextArea } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { customerOptions } from "@/modules/customers/service";
import { createRepairAction } from "../actions";

export const metadata = { title: "Nouvel ordre de réparation" };

export default async function NewRepairPage() {
  const ctx = await requireContext("sales.create");
  const clients = await customerOptions(ctx);
  return (
    <>
      <PageHeader title="Nouvel ordre de réparation" subtitle="Si le véhicule est déjà venu, son immatriculation suffit : sa fiche et son historique sont repris." />
      <ActionForm action={createRepairAction} className="grid gap-4 xl:grid-cols-2">
        <Card title="Client">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Client existant"
              name="customerId"
              placeholder="— Nouveau client —"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              className="sm:col-span-2"
            />
            <Field label="Ou nom du nouveau client" name="customerName" />
            <Field label="Téléphone" name="customerPhone" type="tel" placeholder="+228 90 00 00 00" />
          </div>
        </Card>
        <Card title="Véhicule">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Immatriculation" name="plate" required placeholder="Ex. TG 1234 AB" className="font-mono" />
            <Field label="Kilométrage" name="mileage" inputMode="numeric" />
            <Field label="Marque" name="brand" placeholder="Ex. Toyota" />
            <Field label="Modèle" name="model" placeholder="Ex. Hilux" />
            <Field label="Année" name="year" inputMode="numeric" />
            <Field label="N° de châssis (VIN)" name="vin" />
          </div>
        </Card>
        <Card title="Demande du client" className="xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextArea label="Travaux demandés / symptômes" name="complaint" className="sm:col-span-2" />
            <Field label="Promis pour le" name="promisedAt" type="date" />
          </div>
          <SubmitButton className="btn-primary mt-4">Ouvrir l&apos;ordre</SubmitButton>
        </Card>
      </ActionForm>
    </>
  );
}
