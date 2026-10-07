"use client";

import { useState } from "react";
import clsx from "clsx";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signupAction } from "../actions";

const TYPES = [
  { value: "OWNER", emoji: "👤", label: "Propriétaire", hint: "Je loue mes logements" },
  { value: "AGENCY", emoji: "🏢", label: "Agence", hint: "Je gère pour des propriétaires" },
  { value: "TENANT", emoji: "🧑🏾", label: "Locataire", hint: "Je suis mon loyer" },
] as const;

export function SignupForm({ defaultType }: { defaultType: "OWNER" | "AGENCY" | "TENANT" }) {
  const [type, setType] = useState<string>(defaultType);
  return (
    <ActionForm action={signupAction} className="card mt-6 space-y-4 p-5">
      <fieldset>
        <legend className="label">Type de compte</legend>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={clsx(
                "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition",
                type === t.value ? "border-brand-700 bg-brand-50" : "border-stone-200 bg-white hover:border-stone-300",
              )}
            >
              <input type="radio" name="accountType" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
              <span className="text-2xl" aria-hidden>{t.emoji}</span>
              <span className="text-[14px] font-bold">{t.label}</span>
              <span className="text-[12px] leading-tight text-stone-500">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {type === "TENANT" && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-[14px] text-sky-900">
          ℹ️ Le plus simple : demandez à votre agence ou propriétaire de vous inviter. Vous rejoindrez directement votre logement.
        </p>
      )}
      <Field label="Nom complet" name="fullName" autoComplete="name" required />
      {type === "AGENCY" && <Field label="Nom de l'agence" name="organizationName" required />}
      <Field label="Téléphone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="90 12 34 56" hint="Numéro togolais ou international (+…)" required />
      <Field label="Email (facultatif)" name="email" type="email" autoComplete="email" />
      <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} hint="8 caractères minimum" required />
      <SubmitButton className="btn-primary w-full" pendingText="Création…">
        Créer mon compte
      </SubmitButton>
    </ActionForm>
  );
}
