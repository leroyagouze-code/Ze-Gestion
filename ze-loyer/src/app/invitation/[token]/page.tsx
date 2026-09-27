import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/shell";
import { EmptyState, Field } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatPhone } from "@/lib/phone";
import { ROLE_LABELS } from "@/lib/permissions";
import { getInvitation } from "@/modules/invitations/service";
import { acceptAction } from "./actions";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv, session] = await Promise.all([getInvitation(token), getSession()]);
  const first = inv?.fullName.split(" ")[0];
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <Logo className="text-lg text-brand-800" />
      {!inv ? (
        <div className="card mt-8">
          <EmptyState icon="⏳" title="Ce lien n'est plus valide">
            Il a peut-être déjà été utilisé ou a expiré. Demandez un nouveau lien à votre agence ou à votre propriétaire.
            <div className="mt-4">
              <Link className="btn-secondary" href="/connexion">
                Se connecter
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <h1 className="text-[28px] font-extrabold leading-tight">Bonjour {first} 👋</h1>
            <p className="mt-2 text-lg text-stone-700">Votre espace ZE LOYER est prêt.</p>
          </div>
          <div className="card mt-5 space-y-1 p-4 text-[15px]">
            <p>
              <span className="text-stone-600">Invité par :</span> <strong>{inv.orgName}</strong>
            </p>
            {inv.kind === "TENANT" && inv.unitLabel && (
              <p>
                <span className="text-stone-600">Logement :</span> <strong>{inv.unitLabel}</strong> — {inv.propertyName}
              </p>
            )}
            {inv.kind === "OWNER" && <p className="text-stone-700">Vous pourrez consulter vos biens, vos loyers et vos rapports.</p>}
            {inv.kind === "MEMBER" && inv.role && (
              <p>
                <span className="text-stone-600">Rôle :</span> <strong>{ROLE_LABELS[inv.role]}</strong>
              </p>
            )}
            <p>
              <span className="text-stone-600">Téléphone :</span> <strong>{formatPhone(inv.phone)}</strong>
            </p>
          </div>

          {session ? (
            <ActionForm action={acceptAction.bind(null, token)} className="mt-5">
              <p className="mb-3 text-[15px] text-stone-700">
                Vous êtes connecté(e) en tant que <strong>{session.fullName}</strong>. Ce lien sera ajouté à votre compte.
              </p>
              <SubmitButton className="btn-primary w-full" pendingText="Un instant…">
                Rejoindre mon espace
              </SubmitButton>
            </ActionForm>
          ) : inv.hasAccount ? (
            <div className="mt-5 space-y-3">
              <p className="text-[15px] text-stone-700">Ce numéro a déjà un compte ZE LOYER. Connectez-vous pour rejoindre votre espace.</p>
              <Link href={`/connexion?next=${encodeURIComponent(`/invitation/${token}`)}`} className="btn-primary w-full">
                Se connecter
              </Link>
            </div>
          ) : (
            <ActionForm action={acceptAction.bind(null, token)} className="card mt-5 space-y-4 p-5">
              <p className="text-[15px] font-semibold">Créez votre mot de passe pour accéder à votre espace.</p>
              <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} hint="8 caractères minimum" required />
              <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              <Field label="Email (facultatif)" name="email" type="email" autoComplete="email" />
              <SubmitButton className="btn-primary w-full" pendingText="Création…">
                Créer mon accès
              </SubmitButton>
              <p className="text-[13px] text-stone-500">Vous vous connecterez ensuite avec votre numéro de téléphone.</p>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
