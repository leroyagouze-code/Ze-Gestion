"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField } from "@/components/ui";
import { movementAction } from "./actions";

export function MovementForm({
  productId,
  suppliers = [],
  canCost = false,
  currentCost,
}: {
  productId: string;
  suppliers?: { id: string; name: string }[];
  canCost?: boolean;
  currentCost?: number;
}) {
  const [kind, setKind] = useState("in");
  const isIn = kind === "in";
  return (
    <ActionForm action={movementAction} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="productId" value={productId} />
      <SelectField
        label="Type"
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        options={[
          { value: "in", label: "Entrée (réception, achat)" },
          { value: "out", label: "Sortie (perte, casse, don)" },
          { value: "adjustment", label: "Ajustement (+/−)" },
          { value: "inventory", label: "Inventaire (quantité comptée)" },
        ]}
      />
      <Field label="Quantité" name="quantity" inputMode="decimal" required />
      {isIn && canCost && (
        <Field
          label="Prix d'achat unitaire"
          name="unitCost"
          inputMode="decimal"
          hint={
            currentCost !== undefined
              ? `Coût actuel : ${currentCost.toLocaleString("fr-FR")}. Le coût du produit devient la moyenne pondérée (CMP) du stock et de cette entrée.`
              : "Le coût du produit devient la moyenne pondérée (CMP) du stock et de cette entrée."
          }
        />
      )}
      {isIn && suppliers.length > 0 && (
        <SelectField label="Fournisseur" name="supplierId" placeholder="— Aucun —" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      )}
      <Field label="Motif" name="reason" placeholder={isIn ? "Ex. bon de livraison n° 1234" : "Ex. casse, perte…"} />
      <SubmitButton>Valider</SubmitButton>
    </ActionForm>
  );
}
