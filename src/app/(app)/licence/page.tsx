import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyText } from "@/components/copy-text";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { isDesktop } from "@/lib/license";
import { installId, serverUrl } from "@/modules/billing/license";
import { activateLicenseAction, fetchLicenseAction } from "./actions";
import { FetchLicense } from "./fetch-license";

export const metadata = { title: "Licence" };

export default async function LicencePage() {
  const ctx = await requireContext();
  if (!isDesktop() || !ctx.isAdmin) redirect("/dashboard");
  const s = ctx.subscription;
  const id = installId();
  const licensed = s.status === "active";
  const server = serverUrl();
  return (
    <>
      <PageHeader title="Licence du logiciel" subtitle="Activez ZE Gestion sur cet ordinateur avec le code reçu de ZE GROUP." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Situation">
          <div className="space-y-2 text-sm">
            {licensed ? (
              <p>
                <Badge tone={s.readOnly ? "red" : "green"}>{s.readOnly ? "Licence expirée" : "Licence active"}</Badge>{" "}
                Formule <b>{s.planName}</b>,{" "}
                {s.unlimited ? "à vie" : s.readOnly ? `expirée le ${formatDate(s.periodEndsAt!)}` : `valable jusqu'au ${formatDate(s.periodEndsAt!)}`}.
              </p>
            ) : s.readOnly ? (
              <p><Badge tone="red">Essai terminé</Badge> Le logiciel est en lecture seule jusqu&apos;à l&apos;activation d&apos;une licence.</p>
            ) : (
              <p>
                <Badge tone="amber">Essai gratuit</Badge>{" "}
                {s.trialDaysLeft === 1 ? "Dernier jour" : `${s.trialDaysLeft ?? 0} jours restants`}
                {s.trialEndsAt ? `, jusqu'au ${formatDate(s.trialEndsAt)}` : ""}.
              </p>
            )}
            <p className="text-slate-500">Vos données restent sur cet ordinateur. Sans licence valide, elles restent consultables et exportables.</p>
          </div>
        </Card>
        <Card title="Code d'installation de cet ordinateur">
          <p className="mb-3 text-sm text-slate-600">Il est propre à cet ordinateur : la licence achetée pour ce code ne fonctionne que sur lui.</p>
          <CopyText value={id} whatsappText={`Bonjour ZE GROUP, je souhaite une licence ZE Gestion pour « ${ctx.company.name} ». Code d'installation : ${id}`} />
        </Card>
        {server ? (
          <Card title="Acheter ou renouveler en ligne">
            <p className="mb-3 text-sm text-slate-600">
              Paiement par TMoney ou Flooz. Dès que le paiement est confirmé, la licence s&apos;active toute seule sur cet ordinateur (il faut internet à ce moment-là).
            </p>
            <div className="space-y-2">
              <a href={`${server}/acheter-licence?code=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" className="btn-primary w-full">Acheter une licence</a>
              <FetchLicense action={fetchLicenseAction} auto={!licensed || s.readOnly} />
            </div>
          </Card>
        ) : (
          <Card title="Acheter une licence">
            <p className="text-sm text-slate-600">Envoyez le code d&apos;installation à ZE GROUP avec la formule et la durée choisies, puis saisissez ci-dessous le code reçu.</p>
          </Card>
        )}
        <Card title="Saisir un code de licence reçu" className="xl:col-span-2">
          <ActionForm action={activateLicenseAction} className="space-y-3" resetOnSuccess>
            <textarea
              name="code"
              required
              rows={3}
              className="input font-mono text-sm"
              placeholder="Collez ici le code reçu (majuscules, minuscules et tirets acceptés)"
              spellCheck={false}
            />
            <SubmitButton pendingText="Vérification…">Activer la licence</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
