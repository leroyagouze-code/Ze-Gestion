import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { getContext, getSession, pendingStep } from "@/lib/auth/server";
import { loginAction } from "../actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  if (pendingStep(await getSession()) || (await getContext())) redirect("/");
  const { error, reset } = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="mb-4 text-lg font-semibold">Connexion</h1>
      {error === "no_company" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Aucune entreprise active n&apos;est liée à ce compte.</p>
      )}
      {reset === "1" && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Mot de passe modifié. Connectez-vous avec le nouveau : vos autres appareils ont été déconnectés.
        </p>
      )}
      <ActionForm action={loginAction} className="space-y-4" showOk={false}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className="btn-primary w-full" pendingText="Connexion…">
          Se connecter
        </SubmitButton>
      </ActionForm>
      <p className="mt-3 text-center text-sm">
        <Link href="/mot-de-passe-oublie" className="text-slate-600 hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-slate-600">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:underline">
          Créer mon entreprise
        </Link>
      </p>
    </div>
  );
}
