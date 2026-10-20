"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { SubmitButton } from "@/components/action-form";
import type { ActionState } from "@/lib/actions";

export type PlanOffer = {
  code: string;
  name: string;
  features: string[];
  durations: { months: number; label: string; amount: string; perMonth: string | null; saving: string | null }[];
};
type Preview = { ok: true; code: string; list: string; discount: string; amount: string } | { ok: false; error: string };

export function SubscribeForm({
  action,
  previewAction,
  plans,
  currentPlan,
  phone,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  previewAction: (code: string, plan: string, months: number) => Promise<Preview>;
  plans: PlanOffer[];
  currentPlan: string | null;
  phone: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [plan, setPlan] = useState(plans.find((p) => p.code === currentPlan)?.code ?? plans.find((p) => p.code === "PRO")?.code ?? plans[0]?.code);
  const [months, setMonths] = useState(12);
  const chosenPlan = plans.find((p) => p.code === plan);
  const chosen = chosenPlan?.durations.find((d) => d.months === months);
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, startCheck] = useTransition();
  const check = (code: string) => {
    if (!code.trim() || !plan) return;
    startCheck(async () => {
      const res = await previewAction(code, plan, months);
      setPreview(res);
      setApplied(res.ok ? code : null);
    });
  };
  // Le prix réduit dépend de la formule et de la durée : on le recalcule quand elles changent
  useEffect(() => {
    if (applied) check(applied);
  }, [plan, months]);
  const discounted = preview?.ok && applied ? preview : null;
  return (
    <form action={formAction} className="space-y-5">
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <fieldset>
        <legend className="label">Formule</legend>
        <input type="hidden" name="plan" value={plan ?? ""} />
        <div className="grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <button
              type="button"
              key={p.code}
              onClick={() => setPlan(p.code)}
              className={`flex flex-col items-start justify-start rounded-lg border p-3 text-left text-sm transition ${plan === p.code ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="flex w-full items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-900">{p.name}</span>
                {p.code === currentPlan && <span className="text-xs text-brand-700">Actuelle</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">{p.features.slice(0, 3).join(" · ")}</div>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Durée</legend>
        <input type="hidden" name="months" value={months} />
        <div className="grid gap-2 sm:grid-cols-2">
          {chosenPlan?.durations.map((d) => (
            <button
              type="button"
              key={d.months}
              onClick={() => setMonths(d.months)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${months === d.months ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className="text-left">
                {d.label}
                {d.saving && <span className="block text-xs font-medium text-emerald-700">{d.saving}</span>}
              </span>
              <span className="text-right">
                <span className="font-semibold tabular-nums">{d.amount}</span>
                {d.perMonth && <span className="block text-xs text-slate-500">soit {d.perMonth} / mois</span>}
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
          <label className="label" htmlFor="phone">Numéro qui paie</label>
          <input id="phone" name="phone" required inputMode="tel" defaultValue={phone} className="input" placeholder="90 12 34 56" />
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
