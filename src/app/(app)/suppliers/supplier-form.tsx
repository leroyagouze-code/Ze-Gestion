import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import type { suppliers } from "@/db/schema";

export function SupplierForm({ action, s }: { action: (st: ActionState, fd: FormData) => Promise<ActionState>; s?: typeof suppliers.$inferSelect }) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nom" name="name" required defaultValue={s?.name} />
      <Field label="Entreprise" name="companyName" defaultValue={s?.companyName ?? ""} />
      <Field label="Téléphone" name="phone" type="tel" defaultValue={s?.phone ?? ""} />
      <Field label="Email" name="email" type="email" defaultValue={s?.email ?? ""} />
      <Field label="Adresse" name="address" defaultValue={s?.address ?? ""} />
      <Field label="Montant dû" name="balanceDue" inputMode="decimal" defaultValue={s?.balanceDue ?? 0} hint="Suivi manuel en attendant le module Achats" />
      <TextArea label="Notes" name="notes" defaultValue={s?.notes ?? ""} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <SubmitButton>{s ? "Enregistrer" : "Créer le fournisseur"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
