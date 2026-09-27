import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { countryName } from "@/lib/countries";
import { formatDate } from "@/lib/dates";
import { listInstalls } from "@/modules/installs/service";

export const metadata = { title: "Installations" };

export default async function InstallationsPage() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const [data, [web]] = await Promise.all([listInstalls(), db.select({ n: count() }).from(companies)]);
  const stats = [
    { label: "Logiciels Windows installés", value: data.total },
    { label: "Actifs ces 7 derniers jours", value: data.active7 },
    { label: "Avec licence", value: data.licensed },
    { label: "Entreprises en ligne", value: web.n },
  ];
  return (
    <>
      <PageHeader
        title="Installations dans le monde"
        subtitle="Chaque logiciel Windows se signale au démarrage puis une fois par jour, sans aucune donnée de vente ni de client."
        actions={<Link href="/admin" className="btn-secondary">Retour</Link>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="card p-4">
            <p className="text-xs text-slate-500">{x.label}</p>
            <p className="text-2xl font-semibold">{x.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Par pays">
          {data.byCountry.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune installation signalée pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.byCountry.map(([code, n]) => (
                <li key={code} className="flex justify-between py-1.5">
                  <span>{code === "??" ? "Pays inconnu" : countryName(code)}</span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Dernières installations" className="xl:col-span-2">
          {data.rows.length === 0 ? (
            <EmptyState title="Aucune installation signalée">
              <p className="text-sm text-slate-500">Les logiciels se signalent dès que l&apos;adresse du serveur en ligne est renseignée dans le logiciel.</p>
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Entreprise</th><th>Pays</th><th>Installé le</th><th>Vu le</th><th>Version</th><th>Licence</th></tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="font-medium">{r.companyName ?? "Pas encore créée"}</span>
                        <span className="block text-xs text-slate-500">{r.installId}</span>
                      </td>
                      <td>{r.country ? countryName(r.country) : "—"}</td>
                      <td>{formatDate(r.firstSeenAt)}</td>
                      <td>{formatDate(r.lastSeenAt, true)}</td>
                      <td className="text-xs">{r.version ?? "—"}<span className="block text-slate-400">{r.os}</span></td>
                      <td>{r.licensed ? <Badge tone="green">Oui</Badge> : <Badge>Essai</Badge>}</td>
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
