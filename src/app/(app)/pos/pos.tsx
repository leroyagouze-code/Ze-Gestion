"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Camera, Minus, Plus, ScanLine, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { computeTotals, formatMoney, formatQty, type TaxMode } from "@/lib/money";
import type { PosCustomer } from "@/modules/customers/service";
import { createPosCustomerAction, createSaleAction, searchPosCustomersAction } from "./actions";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: number;
  promoPrice: number | null;
  unit: string;
  taxRate: number;
  stock: number;
};
type Line = { product: Product; quantity: number; discount: number };
type Method = { id: string; label: string; type: string };
/** auto : montant rempli par la caisse, qui suit le total tant que le caissier ne le modifie pas. */
type Pay = { paymentMethodId: string; amount: string; reference: string; auto?: boolean };

const price = (p: Product) => (p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : p.salePrice);

export function Pos({
  currency,
  decimals,
  taxMode = "line",
  paymentMethods,
  canCreateCustomer,
  canDiscount,
  canInvoice,
}: {
  currency: string;
  decimals: number;
  taxMode?: TaxMode;
  paymentMethods: Method[];
  canCreateCustomer: boolean;
  canDiscount: boolean;
  canInvoice: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { id: string; number: string; total: number; change: number; due: number; invoiceId: string | null }>(null);
  const [pending, start] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const m = (v: number) => formatMoney(v, currency);

  const search = useCallback(async (term: string) => {
    const res = await fetch(`/api/pos/search?q=${encodeURIComponent(term)}`);
    if (res.ok) return (await res.json()) as Product[];
    return [];
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q).then(setResults), q ? 180 : 0);
    return () => clearTimeout(t);
  }, [q, search]);

  const add = useCallback((p: Product, qty = 1) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + qty } : l));
      return [...c, { product: p, quantity: qty, discount: 0 }];
    });
    setError(null);
  }, []);

  /** Entrée dans la recherche = lecteur de code-barres (il tape le code puis Entrée). */
  async function onEnter() {
    const term = q.trim();
    if (!term) return;
    const found = await search(term);
    const exact = found.find((p) => p.barcode === term || p.sku === term);
    if (exact || found.length === 1) {
      add(exact ?? found[0]);
      setQ("");
    } else if (!found.length) setError(`Aucun produit pour « ${term} »`);
  }

  const totals = useMemo(
    () =>
      computeTotals(
        cart.map((l) => ({ quantity: l.quantity, unitPrice: price(l.product), discount: l.discount, taxRate: l.product.taxRate })),
        Number(discount.replace(",", ".")) || 0,
        decimals,
        taxMode,
      ),
    [cart, discount, decimals, taxMode],
  );

  const tendered = pays.reduce((s, p) => s + (Number(p.amount.replace(/\s/g, "").replace(",", ".")) || 0), 0);
  const creditSelected = pays.some((p) => paymentMethods.find((mm) => mm.id === p.paymentMethodId)?.type === "credit");
  const effectiveTendered = pays
    .filter((p) => paymentMethods.find((mm) => mm.id === p.paymentMethodId)?.type !== "credit")
    .reduce((s, p) => s + (Number(p.amount.replace(/\s/g, "").replace(",", ".")) || 0), 0);
  const remaining = Math.max(totals.total - effectiveTendered, 0);
  const change = Math.max(effectiveTendered - totals.total, 0);

  function pickMethod(id: string) {
    setPays((ps) => {
      if (ps.length <= 1) return [{ paymentMethodId: id, amount: String(totals.total), reference: "", auto: true }];
      return ps;
    });
  }

  // Le panier change après le choix du moyen de paiement : le montant rempli automatiquement suit
  useEffect(() => {
    setPays((ps) => (ps.length === 1 && ps[0].auto && ps[0].amount !== String(totals.total) ? [{ ...ps[0], amount: String(totals.total) }] : ps));
  }, [totals.total]);

  function reset() {
    setCart([]);
    setDiscount("");
    setCustomer(null);
    setPays([]);
    setDone(null);
    setError(null);
    setShowCart(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function submit(withInvoice: boolean) {
    setError(null);
    const payments = (pays.length ? pays : [{ paymentMethodId: paymentMethods[0]?.id, amount: String(totals.total), reference: "" }]).map((p) => ({
      paymentMethodId: p.paymentMethodId,
      amount: Number(p.amount.replace(/\s/g, "").replace(",", ".")) || 0,
      reference: p.reference || null,
    }));
    start(async () => {
      const res = await createSaleAction(
        {
          items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, discount: l.discount })),
          customerId: customer?.id ?? null,
          discount: Number(discount.replace(",", ".")) || 0,
          payments,
        },
        withInvoice,
      );
      if (!res.ok) setError(res.error);
      else setDone(res);
    });
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">Panier ({cart.length})</h2>
        <div className="flex gap-2">
          {cart.length > 0 && <button className="btn-ghost px-2 text-sm text-red-600" onClick={() => setCart([])}>Vider</button>}
          <button className="btn-ghost px-2 lg:hidden" onClick={() => setShowCart(false)} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {cart.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Scannez ou touchez un produit pour l&apos;ajouter.</p>}
        {cart.map((l, i) => (
          <div key={l.product.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{l.product.name}</div>
                <div className="text-xs text-slate-500">{m(price(l.product))} / {l.product.unit}</div>
              </div>
              <div className="text-right text-sm font-semibold">{m((taxMode === "total" ? totals.lines[i]?.net : totals.lines[i]?.lineTotal) ?? 0)}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-secondary h-9 w-9 p-0" aria-label="Moins" onClick={() => setCart((c) => (l.quantity <= 1 ? c.filter((_, j) => j !== i) : c.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x))))}><Minus size={16} /></button>
              <input
                className="input h-9 w-20 text-center"
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(",", "."));
                  if (!Number.isNaN(v)) setCart((c) => c.map((x, j) => (j === i ? { ...x, quantity: v } : x)));
                }}
              />
              <button className="btn-secondary h-9 w-9 p-0" aria-label="Plus" onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))}><Plus size={16} /></button>
              {canDiscount && <input
                className="input h-9 w-24"
                placeholder="Remise"
                inputMode="decimal"
                value={l.discount || ""}
                onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, discount: Number(e.target.value.replace(",", ".")) || 0 } : x)))}
              />}
              <button className="btn-ghost ml-auto h-9 w-9 p-0 text-red-600" aria-label="Retirer" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-slate-200 p-4">
        <CustomerPicker value={customer} onChange={setCustomer} canCreate={canCreateCustomer} money={m} />
        {canDiscount && <input className="input" placeholder="Remise globale" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-500"><span>Total HT</span><span>{m(totals.subtotal)}</span></div>
          <div className="flex justify-between text-slate-500"><span>TVA</span><span>{m(totals.taxTotal)}</span></div>
          {totals.discountTotal > 0 && <div className="flex justify-between text-slate-500"><span>Remises</span><span>−{m(totals.discountTotal)}</span></div>}
          <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{m(totals.total)}</span></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {paymentMethods.map((pm) => (
            <button
              key={pm.id}
              type="button"
              onClick={() => pickMethod(pm.id)}
              className={clsx("rounded-lg border px-3 py-1.5 text-sm", pays.some((p) => p.paymentMethodId === pm.id) ? "border-brand-700 bg-brand-50 text-brand-800" : "border-slate-300 bg-white")}
            >
              {pm.label}
            </button>
          ))}
        </div>
        {pays.map((p, i) => (
          <div key={i} className="flex gap-2">
            <select className="input" value={p.paymentMethodId} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, paymentMethodId: e.target.value } : x)))}>
              {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.label}</option>)}
            </select>
            <input className="input w-32" inputMode="decimal" value={p.amount} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value, auto: false } : x)))} aria-label="Montant reçu" />
            <input className="input hidden w-32 sm:block" placeholder="Réf." value={p.reference} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} />
            {pays.length > 1 && <button className="btn-ghost px-2" onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} aria-label="Retirer"><X size={16} /></button>}
          </div>
        ))}
        {pays.length > 0 && (
          <button className="text-sm text-brand-700" onClick={() => setPays((ps) => [...ps, { paymentMethodId: paymentMethods[0].id, amount: String(remaining), reference: "" }])}>
            + Paiement fractionné
          </button>
        )}
        {pays.length > 0 && (
          <div className="text-sm">
            {change > 0 && <div className="flex justify-between font-medium text-emerald-700"><span>Monnaie à rendre</span><span>{m(change)}</span></div>}
            {remaining > 0 && <div className="flex justify-between font-medium text-amber-700"><span>{creditSelected ? "À crédit" : "Reste à payer"}</span><span>{m(remaining)}</span></div>}
          </div>
        )}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className={clsx("grid gap-2", canInvoice ? "grid-cols-2" : "grid-cols-1")}>
          {canInvoice && <button className="btn-secondary py-3" disabled={!cart.length || pending} onClick={() => submit(true)}>Vente + facture</button>}
          <button className="btn-primary py-3 text-base" disabled={!cart.length || pending} onClick={() => submit(false)}>
            {pending ? "…" : `Encaisser ${m(totals.total)}`}
          </button>
        </div>
        {tendered === 0 && cart.length > 0 && <p className="text-center text-xs text-slate-500">Sans paiement choisi : {paymentMethods[0]?.label} pour le total.</p>}
      </div>
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-57px)] sm:-m-6 lg:h-dvh">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2 border-b border-slate-200 bg-white p-3">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              ref={searchRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
              placeholder="Scanner un code-barres ou rechercher un produit…"
              className="input h-11 pl-10 text-base"
            />
          </div>
          <button className="btn-secondary h-11" onClick={() => setScanning(true)} aria-label="Scanner avec la caméra"><Camera size={18} /></button>
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((p) => (
            <button key={p.id} onClick={() => add(p)} className="card flex flex-col items-start gap-1 p-3 text-left transition hover:border-brand-500 active:scale-[0.98]">
              <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
              <span className="text-base font-semibold text-brand-700">{m(price(p))}</span>
              <span className={clsx("text-xs", p.stock <= 0 ? "text-red-600" : "text-slate-500")}>Stock : {formatQty(p.stock)} {p.unit}</span>
            </button>
          ))}
          {results.length === 0 && <p className="col-span-full p-6 text-center text-sm text-slate-500">Aucun produit trouvé.</p>}
        </div>
        <button className="btn-primary m-3 py-3 lg:hidden" onClick={() => setShowCart(true)}>
          Panier ({cart.length}) · {m(totals.total)}
        </button>
      </div>
      <aside className="hidden w-[420px] shrink-0 border-l border-slate-200 bg-white lg:block">{cartPanel}</aside>
      {showCart && <div className="fixed inset-0 z-40 bg-white lg:hidden">{cartPanel}</div>}
      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onCode={async (code) => {
            setScanning(false);
            const found = await search(code);
            const p = found.find((x) => x.barcode === code || x.sku === code) ?? (found.length === 1 ? found[0] : null);
            if (p) add(p);
            else setError(`Code ${code} inconnu`);
          }}
        />
      )}
      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="card w-full max-w-sm p-6 text-center">
            <div className="text-sm text-slate-500">Vente {done.number}</div>
            <div className="my-2 text-3xl font-bold">{m(done.total)}</div>
            {done.change > 0 && <div className="mb-2 text-lg font-semibold text-emerald-700">Monnaie : {m(done.change)}</div>}
            {done.due > 0 && <div className="mb-2 text-sm font-medium text-amber-700">Reste dû par le client : {m(done.due)}</div>}
            <div className="mt-4 grid gap-2">
              <a className="btn-secondary" href={`/api/sales/${done.id}/receipt`} target="_blank">Imprimer le ticket</a>
              {done.invoiceId && <a className="btn-secondary" href={`/api/invoices/${done.invoiceId}/pdf`} target="_blank">Télécharger la facture</a>}
              <button className="btn-primary py-3" onClick={reset} autoFocus>Nouvelle vente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Client de la vente : recherche au fil de la frappe (nom ou téléphone) et création rapide
 * (nom + téléphone) sans quitter la caisse. Vide = client comptoir.
 */
function CustomerPicker({
  value,
  onChange,
  canCreate,
  money,
}: {
  value: PosCustomer | null;
  onChange: (c: PosCustomer | null) => void;
  canCreate: boolean;
  money: (v: number) => string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<null | { name: string; phone: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchPosCustomersAction(q).catch(() => []);
      if (!stale) {
        setResults(rows);
        setLoading(false);
      }
    }, q ? 200 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, open]);

  function pick(c: PosCustomer | null) {
    onChange(c);
    setQ("");
    setOpen(false);
    setForm(null);
    setError(null);
  }

  function startCreate() {
    const term = q.trim();
    const looksLikePhone = /^[+\d\s().-]+$/.test(term) && /\d{3}/.test(term);
    setForm(looksLikePhone ? { name: "", phone: term } : { name: term, phone: "" });
    setOpen(false);
    setError(null);
  }

  function save() {
    if (!form) return;
    setError(null);
    startSaving(async () => {
      const res = await createPosCustomerAction(form);
      if (res.ok) pick(res.customer);
      else setError(res.error);
    });
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-500 bg-brand-50 px-3 py-2">
        <UserRound size={18} className="shrink-0 text-brand-700" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-brand-800">{value.name}</div>
          <div className="truncate text-xs text-slate-500">
            {value.phone ?? "Sans téléphone"}
            {value.balanceDue > 0 && <span className="text-amber-700"> · Doit {money(value.balanceDue)}</span>}
          </div>
        </div>
        <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={() => pick(null)} aria-label="Retirer le client"><X size={16} /></button>
      </div>
    );
  }

  if (form) {
    return (
      <form
        className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="text-sm font-medium">Nouveau client</div>
        <input className="input" placeholder="Nom *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!form.name} required maxLength={200} aria-label="Nom du client" />
        <input className="input" placeholder="Téléphone *" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoFocus={!!form.name} required maxLength={40} aria-label="Téléphone du client" />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={() => { setForm(null); setError(null); }} disabled={saving}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={saving || !form.name.trim() || !form.phone.trim()}>{saving ? "…" : "Enregistrer"}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          ref={inputRef}
          className="input pl-9"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
            if (e.key === "Enter") {
              e.preventDefault();
              if (results[0]) pick(results[0]);
            }
          }}
          placeholder="Client comptoir · rechercher nom ou téléphone"
          aria-label="Client"
          autoComplete="off"
        />
      </div>
      {open && (
        <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {results.map((c) => (
            <button key={c.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => pick(c)}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                {c.phone && <span className="block truncate text-xs text-slate-500">{c.phone}</span>}
              </span>
              {c.balanceDue > 0 && <span className="shrink-0 text-xs text-amber-700">Doit {money(c.balanceDue)}</span>}
            </button>
          ))}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">{q.trim() ? "Aucun client trouvé." : "Aucun client enregistré."}</p>}
          <div className="flex border-t border-slate-100">
            {canCreate && (
              <button type="button" className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-slate-50" onClick={startCreate}>
                <UserPlus size={16} /> Nouveau client{q.trim() ? ` « ${q.trim()} »` : ""}
              </button>
            )}
            <button type="button" className="ml-auto px-3 py-2 text-sm text-slate-500 hover:bg-slate-50" onClick={() => { setOpen(false); setQ(""); }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Scan par caméra (API BarcodeDetector : Chrome Android, Edge, Safari récent). */
function CameraScanner({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState("Ouverture de la caméra…");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!BD) {
        setMsg("Ce navigateur ne gère pas le scan par caméra. Utilisez Chrome sur Android ou un lecteur de code-barres.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setMsg("Visez le code-barres");
        const detector = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        while (!stop) {
          const codes = await detector.detect(v).catch(() => []);
          if (codes[0]?.rawValue) {
            onCodeRef.current(codes[0].rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setMsg("Accès à la caméra refusé.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
      <video ref={videoRef} className="w-full max-w-md rounded-xl" playsInline muted />
      <p className="text-center text-sm text-white">{msg}</p>
      <button className="btn-secondary" onClick={onClose}>Fermer</button>
    </div>
  );
}
