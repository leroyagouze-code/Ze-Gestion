import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import type { customers } from "@/db/schema";

export function CustomerForm({ action, c }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; c?: typeof customers.$inferSelect }) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nom" name="name" required defaultValue={c?.name} />
      <Field label="Entreprise" name="companyName" defaultValue={c?.companyName ?? ""} />
      <Field label="Téléphone" name="phone" type="tel" defaultValue={c?.phone ?? ""} />
      <Field label="WhatsApp" name="whatsapp" type="tel" defaultValue={c?.whatsapp ?? ""} />
      <Field label="Email" name="email" type="email" defaultValue={c?.email ?? ""} />
      <Field label="Identifiant fiscal" name="taxId" defaultValue={c?.taxId ?? ""} />
      <Field label="Adresse" name="address" defaultValue={c?.address ?? ""} className="sm:col-span-2" />
      <TextArea label="Notes" name="notes" defaultValue={c?.notes ?? ""} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <SubmitButton>{c ? "Enregistrer" : "Créer le client"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
