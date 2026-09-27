"use client";

import { useState } from "react";

export function ShareInvoice({ url, number, total, phone, email, companyName }: { url: string; number: string; total: string; phone?: string | null; email?: string | null; companyName: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Bonjour, voici votre facture ${number} de ${companyName} (${total}) : ${url}`;
  const wa = phone ? phone.replace(/[^\d]/g, "") : "";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} className="input text-xs" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary whitespace-nowrap"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-secondary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}>WhatsApp</a>
        <a className="btn-secondary" href={`mailto:${email ?? ""}?subject=${encodeURIComponent(`Facture ${number}`)}&body=${encodeURIComponent(text)}`}>Email</a>
      </div>
    </div>
  );
}
