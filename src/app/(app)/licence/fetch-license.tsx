"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/actions";

/** Bouton « Récupérer ma licence » ; vérifie aussi une fois à l'ouverture de la page quand aucune licence n'est active. */
export function FetchLicense({ action, auto }: { action: (s: ActionState) => Promise<ActionState>; auto: boolean }) {
  const [state, run, pending] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (auto && !done.current) {
      done.current = true;
      form.current?.requestSubmit();
    }
  }, [auto]);
  const quietMiss = auto && state?.error?.startsWith("Aucun achat");
  return (
    <form ref={form} action={run} className="space-y-3">
      {state?.error && !quietMiss && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state?.ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</div>}
      <button className="btn-secondary w-full" disabled={pending}>{pending ? "Vérification…" : "Récupérer ma licence"}</button>
    </form>
  );
}
