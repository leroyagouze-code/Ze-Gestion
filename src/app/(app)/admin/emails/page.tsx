import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader, SelectField, TableWrap, TextArea } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { mailEnabled } from "@/lib/mail";
import { AUDIENCES, audienceCounts, listCampaigns, type Audience } from "@/modules/marketing/service";
import { campaignAction } from "../actions";
import { CampaignButtons } from "./campaign-buttons";

export const metadata = { title: "E-mails aux clients" };
export const dynamic = "force-dynamic";

const EXAMPLE = `Bonjour {nom},

Écrivez ici votre offre ou votre nouveauté pour {entreprise}.

Ouvrir ZE Gestion : https://gestion.zegroupafrica.com

Merci de votre confiance !`;

export default async function EmailsPage() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const [counts, campaigns] = await Promise.all([audienceCounts(s), listCampaigns(s)]);
  return (
    <>
      <PageHeader
        title="E-mails aux clients"
        subtitle="Offres et nouveautés envoyées aux responsables d'entreprise qui acceptent de les recevoir. Un e-mail de bienvenue part déjà tout seul à chaque inscription."
        actions={
          <>
            <Link href="/admin/codes-promo" className="btn-secondary">Codes promo</Link>
            <Link href="/admin" className="btn-secondary">Retour</Link>
          </>
        }
      />
      {!mailEnabled() && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          L&apos;envoi d&apos;e-mails n&apos;est pas configuré sur ce serveur : ajoutez SMTP_PASSWORD avec « ze-gestion config ».
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card title="Nouvel e-mail" className="xl:col-span-3">
          <ActionForm action={campaignAction} className="grid gap-3">
            <SelectField
              label="Destinataires"
              name="audience"
              defaultValue="all"
              options={(Object.keys(AUDIENCES) as Audience[]).map((a) => ({ value: a, label: `${AUDIENCES[a]} (${counts[a]})` }))}
            />
            <Field label="Objet" name="subject" required maxLength={150} />
            <TextArea label="Message" name="body" required rows={12} defaultValue={EXAMPLE} />
            <p className="text-xs text-slate-500">
              {"{nom}"} est remplacé par le nom du responsable et {"{entreprise}"} par le nom de son entreprise. Une ligne vide sépare
              les paragraphes ; les liens https:// deviennent cliquables. Le lien de désabonnement est ajouté automatiquement.
            </p>
            <CampaignButtons counts={counts} />
          </ActionForm>
        </Card>
        <Card title="Envois précédents" className="xl:col-span-2">
          {campaigns.length === 0 ? (
            <EmptyState title="Aucun envoi pour l'instant" />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Objet</th><th className="text-right">Envoyés</th><th>État</th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="font-medium">{c.subject}</div>
                        <div className="text-xs text-slate-500">
                          {formatDate(c.createdAt)} · {AUDIENCES[c.audience as Audience] ?? c.audience}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">
                        {c.sent}/{c.recipients}
                        {c.failed > 0 && <div className="text-xs text-red-600">{c.failed} échec(s)</div>}
                      </td>
                      <td>{c.status === "done" ? <Badge tone="green">Terminé</Badge> : <Badge tone="amber">En cours</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
