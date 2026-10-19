"use client";

import { useFormStatus } from "react-dom";

/** Deux boutons dans le même formulaire : aperçu à soi-même, puis envoi réel après confirmation. */
export function CampaignButtons({ counts }: { counts: Record<string, number> }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" name="intent" value="test" className="btn-secondary" disabled={pending}>
        M&apos;envoyer un test
      </button>
      <button
        type="submit"
        name="intent"
        value="send"
        className="btn-primary"
        disabled={pending}
        onClick={(e) => {
          const select = e.currentTarget.form?.elements.namedItem("audience") as HTMLSelectElement | null;
          const n = counts[select?.value ?? "all"] ?? 0;
          if (!window.confirm(`Envoyer cet e-mail à ${n} destinataire(s) ? L'envoi ne peut pas être annulé.`)) e.preventDefault();
        }}
      >
        {pending ? "Envoi…" : "Envoyer"}
      </button>
    </div>
  );
}
