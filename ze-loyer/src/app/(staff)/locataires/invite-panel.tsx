"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import type { ActionState } from "@/lib/actions";

/**
 * « Inviter » : génère un lien sécurisé. L'envoi se fait depuis le téléphone de l'utilisateur
 * (WhatsApp / SMS / copier) : ZE LOYER n'envoie aucun message automatiquement.
 */
export function InvitePanel({ action, label = "📲 Inviter le locataire" }: { action: (s: ActionState) => Promise<ActionState>; label?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const inv = state?.data as { url: string; message: string; whatsapp: string; expiresInDays: number } | undefined;
  if (inv)
    return (
      <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-[15px] font-semibold text-brand-900">✅ Lien créé (valable {inv.expiresInDays} jours)</p>
        <p className="break-all rounded-lg bg-white p-2 font-mono text-[13px]">{inv.url}</p>
        <div className="flex flex-wrap gap-2">
          <a href={inv.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
            Envoyer par WhatsApp
          </a>
          <a href={`sms:?body=${encodeURIComponent(inv.message)}`} className="btn-secondary btn-sm">
            Envoyer par SMS
          </a>
          <CopyButton text={inv.message} label="Copier le message" />
        </div>
        <p className="text-[13px] text-stone-600">WhatsApp et SMS s&apos;ouvrent sur votre téléphone : c&apos;est vous qui envoyez le message.</p>
      </div>
    );
  return (
    <form action={run}>
      {state?.error && <p className="mb-2 text-[14px] text-red-700">⚠️ {state.error}</p>}
      <button className="btn-secondary w-full" disabled={pending}>
        {pending ? "Création du lien…" : label}
      </button>
    </form>
  );
}
