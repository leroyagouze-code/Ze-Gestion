"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormMessage } from "@/components/action-form";
import { inviteMemberAction } from "../../proprietaires/actions";

export function InviteResult({ children }: { children: React.ReactNode }) {
  const [state, action] = useActionState(inviteMemberAction, undefined);
  const inv = state?.data as { url: string; message: string; whatsapp: string } | undefined;
  return (
    <div className="space-y-4">
      {state?.error && <FormMessage state={state} />}
      {inv && (
        <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="font-semibold text-brand-900">✅ Lien prêt</p>
          <p className="break-all font-mono text-[13px]">{inv.url}</p>
          <div className="flex flex-wrap gap-2">
            <a href={inv.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
              Envoyer par WhatsApp
            </a>
            <CopyButton text={inv.message} label="Copier le message" />
          </div>
        </div>
      )}
      <form action={action} className="space-y-4">
        {children}
      </form>
    </div>
  );
}
