import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { changePasswordAction, logoutAction } from "../../actions";

export const metadata = { title: "Mot de passe" };

export default async function PasswordPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Changer mon mot de passe</h1>
      {s.mustChangePassword ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Votre mot de passe a été fixé par un administrateur. Choisissez-en un personnel avant de continuer : lui seul le connaîtra.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">Vos autres appareils seront déconnectés.</p>
      )}
      <ActionForm action={changePasswordAction} className="space-y-4" showOk={false}>
        <Field label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" required />
        <Field label="Nouveau mot de passe" name="next" type="password" autoComplete="new-password" minLength={8} required hint="8 caractères minimum" />
        <Field label="Confirmer le nouveau mot de passe" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        <SubmitButton className="btn-primary w-full" pendingText="Enregistrement…">
          Enregistrer
        </SubmitButton>
      </ActionForm>
      <div className="mt-4 flex justify-between text-sm">
        {!s.mustChangePassword ? <Link href="/" className="text-brand-700 hover:underline">Retour</Link> : <span />}
        <form action={logoutAction}>
          <button className="text-slate-500 hover:underline">Déconnexion</button>
        </form>
      </div>
    </div>
  );
}
