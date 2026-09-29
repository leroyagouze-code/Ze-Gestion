import Link from "next/link";
import { parsePeriod, PeriodFilter } from "@/components/period-filter";
import { Card, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";
import { periodRange, PERIOD_LABELS } from "@/modules/dashboard/service";
import { salesReport } from "@/modules/reports/service";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const ctx = await requireContext("reports.view");
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const r = await salesReport(ctx, periodRange(period, sp));
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const sum = (k: "count" | "subtotal" | "tax" | "total" | "cost" | "due") => r.byDay.reduce((s, d) => s + d[k], 0);
  const margin = sum("subtotal") - sum("cost");
  const qs = new URLSearchParams(Object.entries({ period, from: sp.from ?? "", to: sp.to ?? "" }).filter(([, v]) => v)).toString();
  return (
    <>
      <PageHeader
        title="Rapports"
        subtitle={PERIOD_LABELS[period]}
        actions={
          <>
            {can(ctx.permissions, "data.export") && (
              <>
                <a href={`/api/export/sales?${qs}`} className="btn-secondary">Ventes CSV</a>
                <a href="/api/export/stock" className="btn-secondary">Stock CSV</a>
                <a href="/api/export/customers" className="btn-secondary">Clients CSV</a>
              </>
            )}
            <Link href="/reports/caissiers" className="btn-secondary">Par caissier / caisse</Link>
            <PrintButton />
          </>
        }
      />
      <div className="no-print"><PeriodFilter current={period} from={sp.from} to={sp.to} /></div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Ventes" value={sum("count")} />
        <Stat label="CA TTC" value={m(sum("total"))} />
        <Stat label="TVA collectée" value={m(sum("tax"))} />
        {r.showProfit && <Stat label="Marge brute" value={m(margin)} />}
        {r.showProfit && <Stat label="Bénéfice net estimé" value={m(margin - r.expenses)} tone={margin - r.expenses >= 0 ? "good" : "bad"} hint={`Dépenses : ${m(r.expenses)}`} />}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Ventes par jour">
          <TableWrap>
            <table className="table">
              <thead><tr><th>Date</th><th className="text-right">Nb</th><th className="text-right">HT</th><th className="text-right">TVA</th><th className="text-right">TTC</th>{r.showProfit && <th className="text-right">Marge</th>}</tr></thead>
              <tbody>
                {r.byDay.map((d) => (
                  <tr key={d.date}><td>{formatDate(d.date)}</td><td className="text-right">{d.count}</td><td className="text-right">{m(d.subtotal)}</td><td className="text-right">{m(d.tax)}</td><td className="text-right">{m(d.total)}</td>{r.showProfit && <td className="text-right">{m(d.subtotal - d.cost)}</td>}</tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Par produit">
          <TableWrap>
            <table className="table">
              <thead><tr><th>Produit</th><th className="text-right">Qté</th><th className="text-right">CA</th>{r.showProfit && <th className="text-right">Coût</th>}</tr></thead>
              <tbody>
                {r.byProduct.map((p) => (
                  <tr key={p.name}><td>{p.name}</td><td className="text-right">{formatQty(p.quantity)}</td><td className="text-right">{m(p.revenue)}</td>{r.showProfit && <td className="text-right">{m(p.cost)}</td>}</tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Encaissements par moyen de paiement">
          <div className="overflow-x-auto">
            <table className="table">
              <tbody>
                {r.byPayment.map((p) => (
                  <tr key={p.method}><td>{p.method}</td><td className="text-right">{p.count}</td><td className="text-right">{m(p.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="TVA par taux">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Taux</th><th className="text-right">Base HT</th><th className="text-right">TVA</th></tr></thead>
              <tbody>
                {r.byTax.map((t) => (
                  <tr key={t.rate}><td>{formatQty(t.rate)} %</td><td className="text-right">{m(t.base)}</td><td className="text-right">{m(t.tax)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
