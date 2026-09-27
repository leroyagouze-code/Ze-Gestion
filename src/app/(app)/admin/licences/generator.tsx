"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { CopyText } from "@/components/copy-text";
import { Field, SelectField } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Issued = { code: string; installId: string; plan: string; expiresAt: string | null };

export function LicenseGenerator({
  action,
  plans,
  durations,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  plans: string[];
  durations: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, undefined);
  const issued = state?.data as Issued | undefined;
  const until = issued ? (issued.expiresAt ? `valable jusqu'au ${new Date(issued.expiresAt).toLocaleDateString("fr-FR")}` : "à vie") : "";
  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</div>}
        <Field label="Code d'installation du client" name="installId" placeholder="Ex. 7K2P-QX9M" required className="font-mono" />
        <Field label="Client (facultatif)" name="customer" placeholder="Ex. Boutique Ama, Lomé" />
        <SelectField label="Formule" name="plan" options={plans.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))} defaultValue="BASIC" />
        <SelectField label="Durée" name="duration" options={durations} defaultValue="12" />
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Création…">Créer le code</SubmitButton>
        </div>
      </form>
      {issued && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-sm text-emerald-900">
            Code pour le poste <b className="font-mono">{issued.installId}</b>, formule {issued.plan}, {until}. À envoyer au client :
          </p>
          <CopyText value={issued.code} whatsappText={`Votre code de licence ZE Gestion (${issued.plan}, ${until}) :\n${issued.code}\n\nDans le logiciel : menu Licence, puis collez le code et cliquez sur « Activer la licence ».`} />
        </div>
      )}
    </div>
  );
}
