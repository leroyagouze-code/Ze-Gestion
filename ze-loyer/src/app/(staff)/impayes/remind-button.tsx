"use client";

import { useActionState } from "react";
import { remindAction } from "../actions";

/** « Relancer » : notification dans l'espace du locataire + envoi WhatsApp/SMS depuis SON téléphone (aucun envoi automatique). */
export function RemindButton({ leaseId }: { leaseId: string }) {
  const [state, action, pending] = useActionState(remindAction.bind(null, leaseId), undefined);
  const links = state?.data as { whatsapp: string; sms: string } | undefined;
  return (
    <div className="w-full">
      {!state?.ok ? (
        <form action={action}>
          <button className="btn-secondary btn-sm w-full" disabled={pending}>
            {pending ? "…" : "🔔 Relancer"}
          </button>
        </form>
      ) : (
        <div className="space-y-2 rounded-xl bg-sand-100 p-3 text-[14px]">
          <p>✅ {state.ok}</p>
          {links && (
            <div className="flex flex-wrap gap-2">
              <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                Envoyer par WhatsApp
              </a>
              <a href={links.sms} className="btn-secondary btn-sm">
                Envoyer par SMS
              </a>
            </div>
          )}
          <p className="text-[12px] text-stone-500">WhatsApp / SMS s&apos;ouvrent sur votre téléphone : c&apos;est vous qui envoyez le message.</p>
        </div>
      )}
      {state?.error && <p className="mt-1 text-[13px] text-red-700">⚠️ {state.error}</p>}
    </div>
  );
}
