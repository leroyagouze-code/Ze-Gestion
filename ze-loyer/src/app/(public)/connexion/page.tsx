import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { getSession, homePath } from "@/lib/auth/server";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Se connecter" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect(await homePath());
  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold">Se connecter</h1>
      <p className="mt-1 text-stone-600">Avec votre numéro de téléphone.</p>
      <ActionForm action={loginAction} className="card mt-6 space-y-4 p-5">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Téléphone (ou email)" name="identifier" type="text" inputMode="tel" autoComplete="username" placeholder="90 12 34 56" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className="btn-primary w-full" pendingText="Connexion…">
          Se connecter
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-[15px] text-stone-600">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-semibold text-brand-700 underline">
          Créer mon compte
        </Link>
      </p>
      <p className="mt-3 text-center text-[14px] text-stone-500">Locataire ? Votre agence ou propriétaire peut vous envoyer un lien d&apos;accès.</p>
    </div>
  );
}
