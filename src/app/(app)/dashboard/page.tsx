import Link from "next/link";
import { RevenueChart, TopProductsChart } from "@/components/charts";
import { parsePeriod, PeriodFilter } from "@/components/period-filter";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";
import { dashboardStats, periodRange, PERIOD_LABELS } from "@/modules/dashboard/service";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const ctx = await requireContext("dashboard.view");
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const s = await dashboardStats(ctx, periodRange(period, sp));
  const m = (v: number) => formatMoney(v, ctx.company.currency);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${ctx.company.name} · ${PERIOD_LABELS[period]}`}
        actions={
          can(ctx.permissions, "sales.create") && (
            <Link href="/pos" className="btn-primary">
              Nouvelle vente
            </Link>
          )
        }
      />
      <PeriodFilter current={period} from={sp.from} to={sp.to} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="CA du jour" value={m(s.revenueToday)} />
        <Stat label="CA de la semaine" value={m(s.revenueWeek)} />
        <Stat label="CA du mois" value={m(s.revenueMonth)} />
        <Stat label="CA de la période" value={m(s.period.revenue)} hint={`${s.period.count} vente(s)`} />
        {s.period.profit !== null && <Stat label="Bénéfice estimé" value={m(s.period.profit)} tone={s.period.profit >= 0 ? "good" : "bad"} hint="Marge − dépenses" />}
        <Stat label="Dépenses" value={m(s.period.expenses)} />
        <Stat label="Produits" value={s.productCount} hint={s.stockValue !== null ? `Stock : ${m(s.stockValue)}` : undefined} />
        <Stat label="Clients" value={s.customerCount} />
        <Stat label="Dettes clients" value={m(s.customerDebt)} tone={s.customerDebt > 0 ? "warn" : "default"} />
        <Stat label="Dettes fournisseurs" value={m(s.supplierDebt)} tone={s.supplierDebt > 0 ? "warn" : "default"} />
        <Stat label="En rupture" value={s.outOfStock.length} tone={s.outOfStock.length ? "bad" : "default"} />
        <Stat label="Bientôt en rupture" value={s.lowStock.length} tone={s.lowStock.length ? "warn" : "default"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Évolution des ventes" className="lg:col-span-2">
          <RevenueChart data={s.trend} currency={ctx.company.currency} />
        </Card>
        <Card title="Produits les plus vendus">
          <TopProductsChart data={s.top} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Alertes de stock" actions={<Link href="/stock?filter=low" className="text-sm text-brand-700">Voir tout</Link>}>
          {s.outOfStock.length + s.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune alerte. 👍</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...s.outOfStock, ...s.lowStock].map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                  <Badge tone={p.quantity <= 0 ? "red" : "amber"}>
                    {p.quantity <= 0 ? "Rupture" : `${formatQty(p.quantity)} ${p.unit} (min ${formatQty(p.minStock)})`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Produits expirés ou bientôt expirés">
          {s.expiring.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun produit concerné dans les 30 prochains jours.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.expiring.map((p) => {
                const expired = new Date(p.expiryDate + "T00:00:00") < new Date();
                return (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                    <Badge tone={expired ? "red" : "amber"}>{expired ? "Expiré" : "Expire"} le {formatDate(p.expiryDate!)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
