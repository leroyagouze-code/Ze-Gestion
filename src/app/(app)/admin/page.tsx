import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { countryName } from "@/lib/countries";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { globalOverview, type ActivityItem } from "@/modules/admin/overview";

export const metadata = { title: "Tableau de bord général" };
export const dynamic = "force-dynamic";

const F = (n: number) => formatMoney(n, "XOF");

const KIND_LABEL: Record<ActivityItem["kind"], string> = { signup: "En ligne", subscription: "Abonnement", order: "Licence", install: "Windows" };

export default async function AdminDashboard() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const o = await globalOverview(s);
  const c = o.online.counts;
  const max = Math.max(1, ...o.revenue.map((m) => m.subs + m.licences));
  const alerts = [
    c.expiring > 0 && { text: `${c.expiring} abonnement(s) en ligne se terminent sous 7 jours`, href: "/admin/entreprises?filter=expiring" },
    c.readonly > 0 && { text: `${c.readonly} entreprise(s) en lecture seule (essai fini ou impayé)`, href: "/admin/entreprises?filter=readonly" },
    o.licences.expiringCount > 0 && { text: `${o.licences.expiringCount} licence(s) Windows expirent sous 30 jours`, href: "/admin/licences" },
    o.licences.pending > 0 && { text: `${o.licences.pending} achat(s) de licence en attente de paiement`, href: "/admin/licences?statut=pending" },
    o.licences.failed30 > 0 && { text: `${o.licences.failed30} achat(s) de licence échoué(s) sur 30 jours`, href: "/admin/licences?statut=failed" },
    !o.licences.canIssue && { text: "Clé des licences absente : aucune licence ne peut être créée sur ce serveur", href: "/admin/licences" },
    o.licences.mode === "simulation" && { text: "Paiements en mode test : aucun argent n'est encaissé", href: "/admin/licences" },
    o.licences.mode === null && { text: "Vente de licences en ligne fermée (aucun service de paiement configuré)", href: "/admin/licences" },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <>
      <PageHeader
        title="Tableau de bord général"
        subtitle="Toute l'activité de ZE Gestion : la version en ligne, le logiciel Windows et l'argent encaissé."
        actions={
          <>
            <Link href="/admin/entreprises" className="btn-secondary">Entreprises</Link>
            <Link href="/admin/installations" className="btn-secondary">Installations</Link>
            <Link href="/admin/licences" className="btn-secondary">Licences</Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Encaissé sur 30 j" value={F(o.cashed30)} tone="good" hint={`Abonnements ${F(o.online.cashed30)} · licences ${F(o.licences.amount30)}`} />
        <Stat label="Revenu mensuel en ligne" value={F(o.online.mrr)} hint={`${c.paid} abonnement(s) payant(s)`} />
        <Stat label="Entreprises en ligne" value={c.all} hint={`${o.online.signups30} nouvelle(s) sur 30 j · ${o.online.users} utilisateurs`} />
        <Stat label="Logiciels Windows" value={o.desktop.total} hint={`${o.desktop.active7} actifs cette semaine · ${o.desktop.licensed} avec licence`} />
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-amber-900 hover:bg-amber-100">
              <span>{a.text}</span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Encaissements des 6 derniers mois" className="xl:col-span-2">
          <div className="flex h-44 items-end gap-3">
            {o.revenue.map((m) => {
              const total = m.subs + m.licences;
              return (
                <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="text-[11px] tabular-nums text-slate-500">{total ? Math.round(total / 1000).toLocaleString("fr-FR") + " k" : ""}</div>
                  <div className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t" style={{ height: `${(total / max) * 100}%` }} title={`Abonnements ${F(m.subs)} · licences ${F(m.licences)}`}>
                    <div className="bg-amber-400" style={{ height: `${total ? (m.licences / total) * 100 : 0}%` }} />
                    <div className="bg-brand-600" style={{ height: `${total ? (m.subs / total) * 100 : 0}%` }} />
                  </div>
                  <div className="text-xs text-slate-500">{m.label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-brand-600" /> Abonnements en ligne</span>
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-amber-400" /> Licences Windows</span>
          </div>
        </Card>

        <Card title="Activité récente" className="xl:row-span-2">
          {o.activity.length === 0 ? (
            <EmptyState title="Rien pour l'instant" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {o.activity.map((a, i) => (
                <li key={i} className="py-2">
                  <Link href={a.href ?? "#"} className="block rounded hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{a.title}</span>
                      <span className="shrink-0 whitespace-nowrap"><Badge tone={a.tone ?? "gray"}>{KIND_LABEL[a.kind]}</Badge></span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{a.detail} · {formatDate(a.at, true)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Version en ligne" actions={<Link href="/admin/entreprises" className="text-sm text-brand-700 hover:underline">Voir tout</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Line label="En essai" value={c.trial} href="/admin/entreprises?filter=trial" />
            <Line label="Payantes" value={c.paid} href="/admin/entreprises?filter=paid" />
            <Line label="Accès offert" value={c.unlimited} href="/admin/entreprises?filter=unlimited" />
            <Line label="Lecture seule" value={c.readonly} href="/admin/entreprises?filter=readonly" warn />
            <Line label="Expirent sous 7 j" value={c.expiring} href="/admin/entreprises?filter=expiring" warn />
            <Line label="Suspendues" value={c.suspended} href="/admin/entreprises?filter=suspended" />
          </dl>
        </Card>

        <Card title="Logiciel Windows" actions={<Link href="/admin/licences" className="text-sm text-brand-700 hover:underline">Licences</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Line label="Installations" value={o.desktop.total} href="/admin/installations" />
            <Line label="Nouvelles sur 30 j" value={o.desktop.new30} href="/admin/installations" />
            <Line label="Avec licence" value={o.desktop.licensed} href="/admin/installations" />
            <Line label="Sans licence (essai)" value={o.desktop.total - o.desktop.licensed} href="/admin/installations" />
            <Line label="Licences vendues 30 j" value={o.licences.paid30} href="/admin/licences?statut=paid" />
            <Line label="Achats en attente" value={o.licences.pending} href="/admin/licences?statut=pending" warn />
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {["BASIC", "PRO", "BUSINESS"].map((p) => (
              <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{p} : {o.licences.byPlan[p] ?? 0}</span>
            ))}
          </div>
        </Card>

        <Card title="Où sont installés les logiciels">
          {o.desktop.byCountry.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune installation signalée pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {o.desktop.byCountry.map(([code, n]) => (
                <li key={code} className="flex items-center gap-2">
                  <span className="w-32 truncate">{code === "??" ? "Inconnu" : countryName(code)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-brand-600" style={{ width: `${(n / o.desktop.total) * 100}%` }} /></span>
                  <span className="w-8 text-right tabular-nums text-slate-600">{n}</span>
                </li>
              ))}
            </ul>
          )}
          {o.desktop.versions.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">Versions : {o.desktop.versions.map(([v, n]) => `${v} (${n})`).join(", ")}</p>
          )}
        </Card>

        <Card title="Licences qui expirent bientôt" className="xl:col-span-2">
          {o.licences.expiringSoon.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune licence n&apos;expire dans les 30 prochains jours.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {o.licences.expiringSoon.map((l) => (
                <li key={l.install_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{l.customer?.split(" · ")[0] ?? "Client"} <span className="font-mono text-xs text-slate-500">{l.install_id}</span></span>
                  <span className="whitespace-nowrap text-slate-600">{l.plan} · fin le {formatDate(new Date(l.expires_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Line({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${warn && value > 0 ? "text-amber-600" : "text-slate-900"}`}>{value}</dd>
    </Link>
  );
}
