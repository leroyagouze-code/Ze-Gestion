import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { mailEnabled } from "@/lib/mail";
import { forgotPasswordAction, resetPasswordAction } from "../actions";

export const metadata = { title: "Mot de passe oublié" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email: rawEmail } = await searchParams;
  const email = rawEmail?.trim().toLowerCase().slice(0, 200) ?? "";
  const back = (
    <p className="mt-4 text-center text-sm">
      <Link href="/login" className="text-brand-700 hover:underline">
        Retour à la connexion
      </Link>
    </p>
  );

  // Windows, développement sans SMTP : aucun email ne peut partir
  if (!mailEnabled()) {
    return (
      <div className="card p-6">
        <h1 className="mb-2 text-lg font-semibold">Mot de passe oublié</h1>
        <p className="text-sm text-slate-600">
          La réinitialisation par email n&apos;est pas disponible sur cette installation. Demandez à l&apos;administrateur de votre entreprise
          de réinitialiser votre mot de passe depuis le menu Utilisateurs.
        </p>
        {back}
      </div>
    );
  }

  if (!email) {
    return (
      <div className="card p-6">
        <h1 className="mb-1 text-lg font-semibold">Mot de passe oublié</h1>
        <p className="mb-4 text-sm text-slate-600">Saisissez l&apos;email de votre compte : nous vous enverrons un code à 6 chiffres.</p>
        <ActionForm action={forgotPasswordAction} className="space-y-4" showOk={false}>
          <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
          <SubmitButton className="btn-primary w-full" pendingText="Envoi…">
            Recevoir un code
          </SubmitButton>
        </ActionForm>
        {back}
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Nouveau mot de passe</h1>
      <p className="mb-4 text-sm text-slate-600">
        Si un compte existe pour <strong>{email}</strong>, un code à 6 chiffres vient d&apos;y être envoyé (valable 10 minutes). Pensez à regarder
        dans les courriers indésirables.
      </p>
      <ActionForm action={resetPasswordAction} className="space-y-4" showOk={false}>
        <input type="hidden" name="email" value={email} />
        <Field label="Code reçu par email" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" required autoFocus />
        <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8 caractères minimum" />
        <Field label="Confirmer le nouveau mot de passe" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        <SubmitButton className="btn-primary w-full" pendingText="Enregistrement…">
          Changer le mot de passe
        </SubmitButton>
      </ActionForm>
      <ActionForm action={forgotPasswordAction} className="mt-4 text-center text-sm" showOk={false}>
        <input type="hidden" name="email" value={email} />
        <p className="mb-2 text-slate-500">Rien reçu après une minute ?</p>
        <SubmitButton className="btn-secondary" pendingText="Envoi…">
          Renvoyer le code
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/mot-de-passe-oublie" className="text-slate-600 hover:underline">
          Utiliser une autre adresse
        </Link>
      </p>
      {back}
    </div>
  );
}
