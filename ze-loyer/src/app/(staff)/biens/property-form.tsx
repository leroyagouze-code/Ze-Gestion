import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

export function PropertyForm({
  action,
  owners,
  defaults,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  owners: { id: string; name: string }[];
  defaults?: { name?: string; address?: string | null; city?: string; district?: string | null; description?: string | null; ownerId?: string };
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-5">
      <Field label="Nom du bien" name="name" placeholder="Ex. Résidence Tokoin, Maison Bè…" defaultValue={defaults?.name} required />
      {owners.length > 1 && (
        <SelectField label="Propriétaire" name="ownerId" options={owners.map((o) => ({ value: o.id, label: o.name }))} defaultValue={defaults?.ownerId} placeholder="Choisir…" required />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quartier" name="district" placeholder="Ex. Tokoin, Adidogomé…" defaultValue={defaults?.district ?? ""} />
        <Field label="Ville" name="city" defaultValue={defaults?.city ?? "Lomé"} required />
      </div>
      <Field label="Adresse / repère" name="address" placeholder="Ex. Rue 123, derrière la pharmacie…" defaultValue={defaults?.address ?? ""} />
      <TextArea label="Description (facultatif)" name="description" defaultValue={defaults?.description ?? ""} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
