import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyText } from "@/components/copy-text";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { isDesktop } from "@/lib/license";
import { installId } from "@/modules/billing/license";
import { activateLicenseAction } from "./actions";

export const metadata = { title: "Licence" };

export default async function LicencePage() {
  const ctx = await requireContext();
  if (!isDesktop() || !ctx.isAdmin) redirect("/dashboard");
  const s = ctx.subscription;
  const id = installId();
  const licensed = s.status === "active";
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
        <Card title="1. Code d'installation de cet ordinateur">
          <p className="mb-3 text-sm text-slate-600">Envoyez ce code à ZE GROUP avec la formule et la durée choisies. Il est propre à cet ordinateur.</p>
          <CopyText value={id} whatsappText={`Bonjour ZE GROUP, je souhaite une licence ZE Gestion pour « ${ctx.company.name} ». Code d'installation : ${id}`} />
        </Card>
        <Card title="2. Saisir le code de licence reçu" className="xl:col-span-2">
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
