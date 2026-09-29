"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { SubmitButton } from "@/components/action-form";
import type { ActionState } from "@/lib/actions";

type Offer = { value: string; plan: string; duration: string; amount: string; perMonth: string | null };
type Preview = { ok: true; code: string; list: string; discount: string; amount: string } | { ok: false; error: string };

export function OrderForm({
  action,
  previewAction,
  offers,
  plans,
  installId,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  previewAction: (code: string, offer: string) => Promise<Preview>;
  offers: Offer[];
  plans: { code: string; name: string; features: string }[];
  installId: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [plan, setPlan] = useState(plans[1]?.code ?? plans[0]?.code);
  const own = offers.filter((o) => o.plan === plan);
  const [offer, setOffer] = useState(own.find((o) => o.duration === "12")?.value ?? own[0]?.value);
  const pickPlan = (p: string) => {
    setPlan(p);
    const next = offers.filter((o) => o.plan === p);
    setOffer((cur) => next.find((o) => o.duration === cur?.split(":")[1])?.value ?? next[0]?.value);
  };
  const chosen = offers.find((o) => o.value === offer);
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, startCheck] = useTransition();
  const check = (code: string) => {
    if (!code.trim() || !offer) return;
    startCheck(async () => {
      const res = await previewAction(code, offer);
      setPreview(res);
      setApplied(res.ok ? code : null);
    });
  };
  // Le prix réduit dépend de la formule choisie : on le recalcule quand elle change
  useEffect(() => {
    if (applied) check(applied);
  }, [offer]);
  const discounted = preview?.ok && applied ? preview : null;
  return (
    <form action={formAction} className="space-y-5">
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <div>
        <label className="label" htmlFor="installId">Code d&apos;installation de l&apos;ordinateur</label>
        <input id="installId" name="installId" defaultValue={installId} required placeholder="Ex. 7K2P-QX9M" className="input font-mono uppercase" />
        <p className="mt-1 text-xs text-slate-500">Affiché dans le logiciel, menu Licence. La licence ne fonctionnera que sur cet ordinateur.</p>
      </div>

      <fieldset>
        <legend className="label">Formule</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <button
              type="button"
              key={p.code}
              onClick={() => pickPlan(p.code)}
              className={`flex flex-col items-start justify-start rounded-lg border p-3 text-left text-sm transition ${plan === p.code ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="font-semibold text-slate-900">{p.name}</div>
              <div className="mt-1 text-xs text-slate-500">{p.features}</div>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Durée</legend>
        <input type="hidden" name="offer" value={offer ?? ""} />
        <div className="grid gap-2 sm:grid-cols-2">
          {own.map((o) => (
            <button
              type="button"
              key={o.value}
              onClick={() => setOffer(o.value)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${offer === o.value ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span>{o.duration}</span>
              <span className="text-right">
                <span className="font-semibold tabular-nums">{o.amount}</span>
                {o.perMonth && <span className="block text-xs text-slate-500">soit {o.perMonth} / mois</span>}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="promoCode">Code promo (facultatif)</label>
        <div className="flex gap-2">
          <input
            id="promoCode"
            name="promoCode"
            value={promo}
            onChange={(e) => {
              setPromo(e.target.value);
              setApplied(null);
              setPreview(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check(promo);
              }
            }}
            className="input font-mono uppercase"
            autoComplete="off"
          />
          <button type="button" className="btn-secondary whitespace-nowrap" disabled={!promo.trim() || checking} onClick={() => check(promo)}>
            {checking ? "…" : "Appliquer"}
          </button>
        </div>
        {preview && !preview.ok && <p className="mt-1 text-xs text-red-700">{preview.error}</p>}
        {discounted && (
          <p className="mt-1 text-sm text-emerald-700">
            Code {discounted.code} : <s className="text-slate-500">{discounted.list}</s> <b>{discounted.amount}</b> (−{discounted.discount})
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="customerName">Nom ou commerce</label>
          <input id="customerName" name="customerName" required className="input" placeholder="Ex. Boutique Ama, Lomé" />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail (facultatif)</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Numéro qui paie</label>
          <input id="phone" name="phone" required inputMode="tel" className="input" placeholder="90 12 34 56" />
        </div>
        <fieldset>
          <legend className="label">Moyen de paiement</legend>
          <div className="flex gap-2">
            {[
              ["TMONEY", "TMoney"],
              ["FLOOZ", "Flooz"],
            ].map(([v, l]) => (
              <label key={v} className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="network" value={v} required defaultChecked={v === "TMONEY"} /> {l}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <SubmitButton className="btn-primary w-full" pendingText="Envoi de la demande…">
        {discounted ? `Payer ${discounted.amount}` : chosen ? `Payer ${chosen.amount}` : "Payer"}
      </SubmitButton>
    </form>
  );
}
