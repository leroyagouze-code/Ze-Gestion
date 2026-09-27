import { redirect } from "next/navigation";
import { Badge, Card, PageHeader, Stat, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { platformStats } from "@/modules/admin/service";
import { computeState } from "@/modules/billing/access";
import { extendTrialAction, setPlanAction, setStatusAction } from "./actions";

const STATUS_LABELS: Record<string, string> = { trialing: "Essai", active: "Payé", past_due: "Impayé", suspended: "Suspendu", canceled: "Résilié" };

function SubscriptionCell({ companyId, status, trialEndsAt }: { companyId: string; status: string | null; trialEndsAt: Date | null }) {
  if (!status) return null;
  const st = computeState({ status, trialEndsAt, planName: "" });
  return (
    <div className="mt-1 text-xs text-slate-500">
      {STATUS_LABELS[status] ?? status}
      {st.trialDaysLeft !== null && ` · ${st.trialDaysLeft} j restants`}
      {st.readOnly && <span className="font-medium text-amber-700"> · lecture seule</span>}
      {status === "trialing" && (
        <form action={extendTrialAction.bind(null, companyId)} className="inline">
          {" "}
          <button className="text-brand-700 hover:underline">+14 j</button>
        </form>
      )}
    </div>
  );
}

export const metadata = { title: "Super admin" };

export default async function AdminPage() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const d = await platformStats(s);
  const mrr = d.byPlan.reduce((a, p) => a + p.mrr, 0);
  return (
    <>
      <PageHeader title="Administration de la plateforme" subtitle="Vue globale. Les données commerciales des entreprises ne sont pas accessibles ici ; chaque action est journalisée." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Entreprises" value={d.companies.total} />
        <Stat label="Actives" value={d.companies.active} tone="good" />
        <Stat label="Suspendues" value={d.companies.suspended} tone={d.companies.suspended ? "bad" : "default"} />
        <Stat label="Inscriptions 30 j" value={d.companies.last30} />
        <Stat label="Utilisateurs" value={d.users} hint={`Revenu mensuel : ${formatMoney(mrr, "XOF")}`} />
      </div>
      <Card title="Abonnements par formule" className="mb-4">
        <div className="flex flex-wrap gap-4 text-sm">
          {d.byPlan.map((p) => <div key={p.plan}><b>{p.plan}</b> : {p.count}</div>)}
        </div>
      </Card>
      <div className="card">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Entreprise</th><th>Inscription</th><th>Formule</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {d.recent.map((c) => (
                <tr key={c.id}>
                  <td><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.email} · {[c.city, c.country].filter(Boolean).join(", ")}</div></td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>
                    <form action={setPlanAction.bind(null, c.id)} className="flex gap-1">
                      <select name="planId" defaultValue={d.plans.find((p) => p.name === c.plan)?.id} className="input w-28 py-1">
                        {d.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button className="btn-secondary px-2 py-1">OK</button>
                    </form>
                    <SubscriptionCell companyId={c.id} status={c.subStatus} trialEndsAt={c.trialEndsAt} />
                  </td>
                  <td>{c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspendue</Badge>}</td>
                  <td>
                    <form action={setStatusAction.bind(null, c.id, c.status === "active" ? "suspended" : "active")}>
                      <button className={c.status === "active" ? "text-xs text-red-600 hover:underline" : "text-xs text-brand-700 hover:underline"}>{c.status === "active" ? "Suspendre" : "Réactiver"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
