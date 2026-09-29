"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { computeTotals, formatMoney, type TaxMode } from "@/lib/money";
import { createManualInvoiceAction } from "@/app/(app)/invoices/actions";
import { saveQuoteAction } from "@/app/(app)/quotes/actions";

export type EditorRow = { description: string; quantity: string; unitPrice: string; taxRate: string };
const n = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

type Common = {
  customers: { id: string; name: string }[];
  taxes: { id: string; name: string; rate: number; isDefault: boolean }[];
  currency: string;
  decimals: number;
  taxMode?: TaxMode;
};

/** Correction d'une facture : reprise de son contenu, l'ancienne est annulée à l'enregistrement. */
export type InvoiceInitial = {
  replacesId: string;
  number: string;
  customerId: string | null;
  customerName: string | null;
  dueDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  rows: EditorRow[];
};

/** Proforma : nouvelle (id absent) ou modification (même numéro, révision si déjà envoyée). */
export type QuoteInitial = {
  id?: string;
  number?: string;
  willBumpRevision?: boolean;
  nextRevision?: number;
  customerId: string | null;
  customerName: string | null;
  validUntil: string;
  conditions: string | null;
  notes: string | null;
  discount: number;
  rows: EditorRow[];
};

type Props = Common & ({ kind: "invoice"; initial?: InvoiceInitial } | { kind: "quote"; initial: QuoteInitial });

/** Éditeur de lignes partagé par les factures manuelles et les proformas. */
export function DocumentEditor(props: Props) {
  const { customers, taxes, currency, decimals, taxMode = "line" } = props;
  const inv = props.kind === "invoice" ? props.initial : undefined;
  const quote = props.kind === "quote" ? props.initial : undefined;
  const initial = inv ?? quote;
  const defRate = String(taxes.find((t) => t.isDefault)?.rate ?? 0);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerId ? "" : (initial?.customerName ?? ""));
  const [rows, setRows] = useState<EditorRow[]>(initial?.rows.length ? initial.rows : [{ description: "", quantity: "1", unitPrice: "", taxRate: defRate }]);
  const [dueDate, setDueDate] = useState(inv?.dueDate ?? quote?.validUntil ?? "");
  const [terms, setTerms] = useState(inv?.paymentTerms ?? quote?.conditions ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [discount, setDiscount] = useState(quote?.discount ? String(quote.discount) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const globalDiscount = props.kind === "quote" ? n(discount) : 0;
  const totals = useMemo(
    () => computeTotals(rows.map((r) => ({ quantity: n(r.quantity), unitPrice: n(r.unitPrice), taxRate: n(r.taxRate) })), globalDiscount, decimals, taxMode),
    [rows, decimals, taxMode, globalDiscount],
  );
  const m = (v: number) => formatMoney(v, currency);
  const set = (i: number, k: keyof EditorRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const items = () => rows.filter((r) => r.description.trim()).map((r) => ({ description: r.description, quantity: n(r.quantity), unitPrice: n(r.unitPrice), taxRate: n(r.taxRate) }));

  const submit = () =>
    start(async () => {
      setError(null);
      if (props.kind === "invoice") {
        const res = await createManualInvoiceAction({
          customerId: customerId || null,
          customerName: customerName || null,
          dueDate: dueDate || null,
          paymentTerms: terms || null,
          notes: notes || null,
          replacesId: inv?.replacesId ?? null,
          items: items(),
        });
        if (res.ok) router.push(`/invoices/${res.id}`);
        else setError(res.error);
      } else {
        const res = await saveQuoteAction(quote?.id ?? null, {
          customerId: customerId || null,
          customerName: customerName || null,
          validUntil: dueDate || null,
          conditions: terms || null,
          notes: notes || null,
          discount: globalDiscount,
          items: items(),
        });
        if (res.ok) router.push(`/quotes/${res.id}`);
        else setError(res.error);
      }
    });

  const buttonLabel =
    props.kind === "invoice"
      ? pending ? "Création…" : inv ? "Enregistrer la facture corrigée" : "Créer la facture"
      : pending ? "Enregistrement…" : quote?.id ? "Enregistrer les modifications" : "Créer la proforma";

  return (
    <div className="card space-y-4 p-4 sm:p-6">
      {inv && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Correction de la facture <b>{inv.number}</b> : modifiez ce qui doit l&apos;être. À l&apos;enregistrement, une nouvelle facture est créée et
          l&apos;ancienne est annulée (elle reste visible dans l&apos;historique).
        </div>
      )}
      {quote?.id && quote.willBumpRevision && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Cette proforma a déjà été transmise au client : elle garde le numéro <b>{quote.number}</b> et passera en <b>révision {quote.nextRevision}</b>{" "}
          (mention visible sur le PDF).
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
          <label className="label">{props.kind === "quote" ? "Valable jusqu'au" : "Échéance"}</label>
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
      <div className={props.kind === "quote" ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label">{props.kind === "quote" ? "Conditions (paiement, livraison…)" : "Conditions de paiement"}</label>
          <input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={props.kind === "quote" ? "Ex. 50 % à la commande" : "Ex. 30 jours fin de mois"} />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {props.kind === "quote" && (
          <div>
            <label className="label">Remise globale ({taxMode === "total" ? "sur le HT" : "sur le TTC"})</label>
            <input className="input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
          </div>
        )}
      </div>
      <div className="ml-auto max-w-xs space-y-1 text-sm">
        {totals.discountTotal > 0 && <div className="flex justify-between text-slate-500"><span>Remise</span><span>−{m(totals.discountTotal)}</span></div>}
        <div className="flex justify-between"><span>Total HT</span><span>{m(totals.subtotal)}</span></div>
        <div className="flex justify-between"><span>TVA</span><span>{m(totals.taxTotal)}</span></div>
        <div className="flex justify-between text-base font-semibold"><span>Total TTC</span><span>{m(totals.total)}</span></div>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button className="btn-primary" disabled={pending} onClick={submit}>
        {buttonLabel}
      </button>
    </div>
  );
}
