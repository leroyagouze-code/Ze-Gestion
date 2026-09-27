"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { recordPaymentAction } from "./actions";

export type LeaseOption = { id: string; label: string; rent: number; due: number; advance: number };

const TYPES = [
  { value: "LOYER", label: "Loyer" },
  { value: "AVANCE", label: "Avance (plusieurs mois)" },
  { value: "CAUTION", label: "Caution" },
  { value: "CHARGE", label: "Charges (eau, électricité…)" },
  { value: "FRAIS", label: "Frais" },
  { value: "AUTRE", label: "Autre" },
];
const ADMIN_TYPES = [
  { value: "REMBOURSEMENT", label: "Remboursement au locataire" },
  { value: "AJUSTEMENT", label: "Ajustement (correction)" },
];
const METHODS = [
  { value: "CASH", label: "💵 Espèces" },
  { value: "TMONEY", label: "📱 TMoney / Mixx" },
  { value: "FLOOZ", label: "📱 Flooz" },
  { value: "BANK", label: "🏦 Virement" },
  { value: "OTHER", label: "Autre" },
];

const parse = (v: string) => Number(v.replace(/[\s  ]/g, "")) || 0;

export function PaymentForm({ leases, selected, defaultType, today, canAdjust }: { leases: LeaseOption[]; selected?: string; defaultType?: string; today: string; canAdjust: boolean }) {
  const [leaseId, setLeaseId] = useState(selected ?? (leases.length === 1 ? leases[0].id : ""));
  const [type, setType] = useState(defaultType ?? "LOYER");
  const lease = leases.find((l) => l.id === leaseId);
  const suggested = lease ? (type === "LOYER" ? lease.due || lease.rent : type === "AVANCE" ? lease.rent * 3 : "") : "";
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [method, setMethod] = useState("CASH");

  const preview = useMemo(() => {
    if (!lease || !(type === "LOYER" || type === "AVANCE")) return null;
    const a = parse(amount);
    if (!a) return null;
    const afterDebt = a - lease.due;
    if (afterDebt < 0) return `Paiement partiel : il restera ${formatMoney(-afterDebt)} à payer.`;
    const months = Math.floor((afterDebt + lease.advance) / lease.rent);
    if (lease.due > 0 && afterDebt === 0) return "Ce paiement solde tout ce qui est dû. ✅";
    return `Solde réglé${months > 0 ? ` + ${months} mois payé${months > 1 ? "s" : ""} d'avance` : ""}.`;
  }, [lease, type, amount]);

  return (
    <ActionForm action={recordPaymentAction} className="card space-y-4 p-5">
      <SelectField
        label="Locataire"
        name="leaseId"
        options={leases.map((l) => ({ value: l.id, label: l.label }))}
        value={leaseId}
        onChange={(e) => {
          setLeaseId(e.target.value);
          const l = leases.find((x) => x.id === e.target.value);
          if (l && type === "LOYER") setAmount(String(l.due || l.rent));
        }}
        placeholder="Choisir…"
        required
      />
      {lease && (
        <p className="rounded-xl bg-sand-100 px-4 py-3 text-[15px]">
          Loyer : <strong>{formatMoney(lease.rent)}</strong> · {lease.due > 0 ? <>Reste à payer : <strong className="text-red-800">{formatMoney(lease.due)}</strong></> : lease.advance > 0 ? <>En avance de <strong className="text-sky-800">{formatMoney(lease.advance)}</strong></> : <strong className="text-emerald-800">À jour</strong>}
        </p>
      )}
      <SelectField
        label="Type de paiement"
        name="type"
        options={canAdjust ? [...TYPES, ...ADMIN_TYPES] : TYPES}
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          if (lease && e.target.value === "AVANCE") setAmount(String(lease.rent * 3));
          if (lease && e.target.value === "LOYER") setAmount(String(lease.due || lease.rent));
        }}
      />
      <Field
        label="Montant (FCFA)"
        name="amount"
        inputMode={type === "AJUSTEMENT" ? "text" : "numeric"}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={type === "AJUSTEMENT" ? "Positif = en faveur du locataire, négatif (ex. -5000) = à sa charge" : undefined}
        required
      />
      {preview && <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[15px] font-semibold text-brand-900">{preview}</p>}
      <fieldset>
        <legend className="label">Mode de paiement</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {METHODS.map((m) => (
            <label key={m.value} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-[14px] font-semibold ${method === m.value ? "border-brand-700 bg-brand-50" : "border-stone-200 bg-white"}`}>
              <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date du paiement" name="paidAt" type="date" defaultValue={today} max={today} required />
        <Field label="Référence (facultatif)" name="reference" placeholder={method === "TMONEY" || method === "FLOOZ" ? "N° de transaction" : ""} />
      </div>
      <TextArea label={type === "AJUSTEMENT" ? "Raison de l'ajustement" : "Note (facultatif)"} name="note" required={type === "AJUSTEMENT"} />
      {(method === "TMONEY" || method === "FLOOZ") && (
        <p className="text-[13px] text-stone-500">ℹ️ Enregistrement manuel : ZE LOYER n&apos;est pas encore connecté à TMoney / Flooz. Vérifiez la réception sur votre téléphone.</p>
      )}
      <SubmitButton className="btn-primary w-full" pendingText="Enregistrement…">
        Enregistrer le paiement
      </SubmitButton>
    </ActionForm>
  );
}
