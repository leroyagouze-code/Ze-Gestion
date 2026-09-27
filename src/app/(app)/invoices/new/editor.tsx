"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { computeTotals, formatMoney, type TaxMode } from "@/lib/money";
import { createManualInvoiceAction } from "../actions";

type Row = { description: string; quantity: string; unitPrice: string; taxRate: string };
const n = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

export function InvoiceEditor({
  customers,
  taxes,
  currency,
  decimals,
  taxMode = "line",
  initial,
}: {
  customers: { id: string; name: string }[];
  taxes: { id: string; name: string; rate: number; isDefault: boolean }[];
  currency: string;
  decimals: number;
  taxMode?: TaxMode;
  /** Correction d'une facture : reprise de son contenu, l'ancienne est annulée à l'enregistrement. */
  initial?: {
    replacesId: string;
    number: string;
    customerId: string | null;
    customerName: string | null;
    dueDate: string | null;
    paymentTerms: string | null;
    notes: string | null;
    rows: Row[];
  };
}) {
  const defRate = String(taxes.find((t) => t.isDefault)?.rate ?? 0);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerId ? "" : (initial?.customerName ?? ""));
  const [rows, setRows] = useState<Row[]>(initial?.rows.length ? initial.rows : [{ description: "", quantity: "1", unitPrice: "", taxRate: defRate }]);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [terms, setTerms] = useState(initial?.paymentTerms ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const totals = useMemo(() => computeTotals(rows.map((r) => ({ quantity: n(r.quantity), unitPrice: n(r.unitPrice), taxRate: n(r.taxRate) })), 0, decimals, taxMode), [rows, decimals, taxMode]);
  const m = (v: number) => formatMoney(v, currency);
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="card space-y-4 p-4 sm:p-6">
      {initial && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Correction de la facture <b>{initial.number}</b> : modifiez ce qui doit l&apos;être. À l&apos;enregistrement, une nouvelle facture est créée et
          l&apos;ancienne est annulée (elle reste visible dans l&apos;historique).
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Client enregistré</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Aucun —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {!customerId && (
          <div>
            <label className="label">Ou nom du client</label>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Échéance</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="input col-span-12 sm:col-span-5" placeholder="Désignation" value={r.description} onChange={(e) => set(i, "description", e.target.value)} />
            <input className="input col-span-3 sm:col-span-2" placeholder="Qté" inputMode="decimal" value={r.quantity} onChange={(e) => set(i, "quantity", e.target.value)} />
            <input className="input col-span-4 sm:col-span-2" placeholder={taxMode === "total" ? "P.U. HT" : "P.U. TTC"} inputMode="decimal" value={r.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} />
            <select className="input col-span-3 sm:col-span-2" value={r.taxRate} onChange={(e) => set(i, "taxRate", e.target.value)}>
              {taxes.map((t) => <option key={t.id} value={t.rate}>{t.name}</option>)}
            </select>
            <button className="btn-ghost col-span-2 text-red-600 sm:col-span-1" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        ))}
        <button className="text-sm text-brand-700" onClick={() => setRows((rs) => [...rs, { description: "", quantity: "1", unitPrice: "", taxRate: defRate }])}>+ Ajouter une ligne</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Conditions de paiement</label>
          <input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Ex. 30 jours fin de mois" />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span>Total HT</span><span>{m(totals.subtotal)}</span></div>
        <div className="flex justify-between"><span>TVA</span><span>{m(totals.taxTotal)}</span></div>
        <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(totals.total)}</span></div>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createManualInvoiceAction({
              customerId: customerId || null,
              customerName: customerName || null,
              dueDate: dueDate || null,
              paymentTerms: terms || null,
              notes: notes || null,
              replacesId: initial?.replacesId ?? null,
              items: rows.filter((r) => r.description.trim()).map((r) => ({ description: r.description, quantity: n(r.quantity), unitPrice: n(r.unitPrice), taxRate: n(r.taxRate) })),
            });
            if (res.ok) router.push(`/invoices/${res.id}`);
            else setError(res.error);
          })
        }
      >
        {pending ? "Création…" : initial ? "Enregistrer la facture corrigée" : "Créer la facture"}
      </button>
    </div>
  );
}
