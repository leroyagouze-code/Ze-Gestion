"use client";

import { useState } from "react";

/** Texte à recopier (code d'installation, code de licence) avec bouton Copier et partage WhatsApp facultatif. */
export function CopyText({ value, whatsappText, mono = true }: { value: string; whatsappText?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={value} className={`input ${mono ? "font-mono" : ""} text-sm`} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary whitespace-nowrap"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      {whatsappText && (
        <a className="btn-secondary w-full" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}>
          Envoyer par WhatsApp
        </a>
      )}
    </div>
  );
}
