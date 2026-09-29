import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { logoutAction, resendVerificationAction, verifyEmailAction } from "../actions";

export const metadata = { title: "Vérification de l'email" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.mustVerifyEmail) redirect("/");
  const { welcome } = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Vérifiez votre adresse email</h1>
      <p className="mb-4 text-sm text-slate-600">
        Nous avons envoyé un code à 6 chiffres à <strong>{s.email}</strong>. Saisissez-le pour continuer. Il est valable 10 minutes ;
        pensez à regarder dans les courriers indésirables.
      </p>
      <ActionForm action={verifyEmailAction} className="space-y-4" showOk={false}>
        <input type="hidden" name="welcome" value={welcome === "1" ? "1" : ""} />
        <Field
          label="Code reçu par email"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          required
          autoFocus
        />
        <SubmitButton className="btn-primary w-full" pendingText="Vérification…">
          Valider
        </SubmitButton>
      </ActionForm>
      <ActionForm action={resendVerificationAction} className="mt-4 text-center text-sm">
        <p className="mb-2 text-slate-500">Rien reçu ? Vous pouvez demander un nouveau code toutes les 60 secondes.</p>
        <SubmitButton className="btn-secondary" pendingText="Envoi…">
          Renvoyer le code
        </SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="mt-4 text-right text-sm">
        <button className="text-slate-500 hover:underline">Déconnexion</button>
      </form>
    </div>
  );
}
