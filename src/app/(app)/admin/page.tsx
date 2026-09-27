import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState, PageHeader, Pagination, Stat, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listCompanies, platformOverview, SUBSCRIPTION_FILTERS, type SubscriptionFilter } from "@/modules/admin/service";
import { SubscriptionBadge } from "./subscription-badge";

export const metadata = { title: "Abonnements" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const sp = await searchParams;
  const [o, list] = await Promise.all([platformOverview(s), listCompanies(s, { q: sp.q, filter: sp.filter, page: Number(sp.page) })]);
  const tab = (f: SubscriptionFilter) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("filter", f);
    if (sp.q) p.set("q", sp.q);
    return `/admin${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <PageHeader title="Abonnements" subtitle="Suivi de toutes les entreprises clientes. Les données commerciales ne sont pas accessibles ici ; chaque action est journalisée." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Entreprises" value={o.counts.all} hint={`${o.signups30} inscrites sur 30 j`} />
        <Stat label="En essai" value={o.counts.trial} />
        <Stat label="Payantes" value={o.counts.paid} tone="good" hint={`${o.counts.expiring} expirent sous 7 j`} />
        <Stat label="Accès offert" value={o.counts.unlimited} />
        <Stat label="Lecture seule" value={o.counts.readonly} tone={o.counts.readonly ? "warn" : "default"} />
        <Stat label="Encaissé 30 j" value={formatMoney(o.cashed30, "XOF")} hint={`Revenu mensuel : ${formatMoney(o.mrr, "XOF")}`} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {(Object.keys(SUBSCRIPTION_FILTERS) as SubscriptionFilter[]).map((f) => (
          <Link
            key={f}
            href={tab(f)}
            className={`rounded-full border px-3 py-1 ${list.filter === f ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {SUBSCRIPTION_FILTERS[f].label} <span className="text-slate-400">{o.counts[f]}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        {list.filter !== "all" && <input type="hidden" name="filter" value={list.filter} />}
        <input name="q" defaultValue={sp.q} placeholder="Nom, e-mail ou téléphone…" className="input sm:max-w-sm" />
        <button className="btn-secondary">Rechercher</button>
      </form>

      <div className="card">
        {list.rows.length === 0 ? (
          <EmptyState title="Aucune entreprise" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr><th>Entreprise</th><th>Inscription</th><th>Formule</th><th>Abonnement</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {list.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>
                      <div className="text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>{c.plan ?? "—"}</td>
                    <td>{c.state ? <SubscriptionBadge state={c.state} /> : "—"}</td>
                    <td>{c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspendue</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={list.page} total={list.total} pageSize={list.pageSize} params={{ q: sp.q, filter: list.filter === "all" ? undefined : list.filter }} />
      </div>
    </>
  );
}
