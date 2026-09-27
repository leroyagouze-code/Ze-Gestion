import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField } from "@/components/ui";
import { movementAction } from "./actions";

export function MovementForm({ productId }: { productId: string }) {
  return (
    <ActionForm action={movementAction} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="productId" value={productId} />
      <SelectField
        label="Type"
        name="kind"
        options={[
          { value: "in", label: "Entrée (réception, achat)" },
          { value: "out", label: "Sortie (perte, casse, don)" },
          { value: "adjustment", label: "Ajustement (+/−)" },
          { value: "inventory", label: "Inventaire (quantité comptée)" },
        ]}
      />
      <Field label="Quantité" name="quantity" inputMode="decimal" required />
      <Field label="Motif" name="reason" placeholder="Ex. réception fournisseur, casse…" />
      <SubmitButton>Valider</SubmitButton>
    </ActionForm>
  );
}
