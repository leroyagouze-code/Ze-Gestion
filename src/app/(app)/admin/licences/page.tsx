import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { LICENSE_PLANS } from "@/lib/license";
import { canIssueLicenses, LICENSE_DURATIONS, listLicenseIssues } from "@/modules/billing/license";
import { issueLicenseAction } from "../actions";
import { LicenseGenerator } from "./generator";

export const metadata = { title: "Licences du logiciel" };

export default async function LicencesPage() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const rows = await listLicenseIssues();
  return (
    <>
      <PageHeader
        title="Licences du logiciel Windows"
        subtitle="Le client vous envoie le code d'installation affiché dans son menu Licence ; vous lui renvoyez le code créé ici."
        actions={<Link href="/admin" className="btn-secondary">Retour</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Créer un code">
          {canIssueLicenses() ? (
            <LicenseGenerator
              action={issueLicenseAction}
              plans={Object.values(LICENSE_PLANS)}
              durations={Object.entries(LICENSE_DURATIONS).map(([value, label]) => ({ value, label }))}
            />
          ) : (
            <p className="text-sm text-amber-800">
              La clé privée des licences n&apos;est pas configurée sur ce serveur. Ajoutez la ligne LICENSE_PRIVATE_KEY=… dans le fichier .env puis redémarrez.
            </p>
          )}
        </Card>
        <Card title="Codes déjà créés" className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="Aucun code créé pour l'instant" />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Client</th><th>Poste</th><th>Formule</th><th>Fin</th><th>Code</th></tr>
                </thead>
                <tbody>
                  {rows.map(({ issue: r, createdBy }) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap" title={createdBy ?? undefined}>{formatDate(r.createdAt)}</td>
                      <td>{r.customer ?? "—"}</td>
                      <td className="font-mono">{r.installId}</td>
                      <td>{r.plan}</td>
                      <td className="whitespace-nowrap">{r.expiresAt ? formatDate(r.expiresAt) : "À vie"}</td>
                      <td className="max-w-[16rem] truncate font-mono text-xs" title={r.code}>{r.code}</td>
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
