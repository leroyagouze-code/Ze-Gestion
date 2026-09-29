import Link from "next/link";
import { parsePeriod, PeriodFilter } from "@/components/period-filter";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, EmptyState, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { periodRange, PERIOD_LABELS } from "@/modules/dashboard/service";
import { cashierReport, listRegisters, listSellers, uuidParam, type CashierStats } from "@/modules/registers/service";
import { DifferenceBadge } from "../../caisses/difference";

export const metadata = { title: "Ventes par caissier" };

export default async function CashierReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; user?: string; register?: string }>;
}) {
  const ctx = await requireContext("sales.view");
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const range = periodRange(period, sp);
  const seesAll = can(ctx.permissions, "sales.view_all");
  const [r, regs, sellers] = await Promise.all([
    cashierReport(ctx, range, { userId: uuidParam(sp.user), registerId: uuidParam(sp.register) }),
    listRegisters(ctx),
    listSellers(ctx),
  ]);
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const totals = r.byCashier.reduce((a, x) => ({ count: a.count + x.count, total: a.total + x.total, cancelled: a.cancelled + x.cancelledCount }), { count: 0, total: 0, cancelled: 0 });
  const salesLink = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries({ period, from: sp.from ?? "", to: sp.to ?? "", ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/sales?${q.toString()}`;
  };

  const table = (rows: CashierStats[], label: string, param: "user" | "register") =>
    rows.length === 0 ? (
      <EmptyState title="Aucune vente sur la période" />
    ) : (
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>{label}</th>
              <th className="text-right">Ventes</th>
              <th className="text-right">Total</th>
              <th className="hidden text-right md:table-cell">Panier moyen</th>
              <th className="text-right">Annulées</th>
              <th className="hidden text-right lg:table-cell">Remises</th>
              <th className="hidden text-right lg:table-cell">Crédit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key ?? "none"}>
                <td className="font-medium">
                  {x.key ? <Link href={salesLink({ [param]: x.key })} className="hover:text-brand-700">{x.name ?? "—"}</Link> : param === "register" ? "Sans caisse" : "—"}
                </td>
                <td className="text-right">{x.count}</td>
                <td className="text-right">{m(x.total)}</td>
                <td className="hidden text-right md:table-cell">{m(x.average)}</td>
                <td className="text-right">{x.cancelledCount ? <span className="text-red-600">{x.cancelledCount} · {m(x.cancelledTotal)}</span> : 0}</td>
                <td className="hidden text-right lg:table-cell">{m(x.discountTotal)}</td>
                <td className="hidden text-right lg:table-cell">{x.creditCount ? `${x.creditCount} · ${m(x.creditTotal)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    );

  return (
    <>
      <PageHeader
        title="Ventes par caissier et par caisse"
        subtitle={`${PERIOD_LABELS[period]}${seesAll ? "" : " · vos ventes"}`}
        actions={
          <div className="no-print flex gap-2">
            {can(ctx.permissions, "reports.view") && <Link href="/reports" className="btn-secondary">Rapports</Link>}
            <Link href="/caisses" className="btn-secondary">Caisses</Link>
            <PrintButton />
          </div>
        }
      />
      <div className="no-print"><PeriodFilter current={period} from={sp.from} to={sp.to} /></div>
      <form className="no-print mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="period" value={period} />
        {sp.from && <input type="hidden" name="from" value={sp.from} />}
        {sp.to && <input type="hidden" name="to" value={sp.to} />}
        {seesAll && (
          <select name="user" defaultValue={sp.user ?? ""} className="input w-48" aria-label="Caissier">
            <option value="">Tous les caissiers</option>
            {sellers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select name="register" defaultValue={sp.register ?? ""} className="input w-48" aria-label="Caisse">
          <option value="">Toutes les caisses</option>
          {regs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="btn-secondary">Filtrer</button>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventes" value={totals.count} />
        <Stat label="Total" value={m(totals.total)} />
        <Stat label="Annulations" value={totals.cancelled} tone={totals.cancelled ? "warn" : "default"} />
        <Stat label="Écarts de caisse" value={<DifferenceBadge value={r.differenceTotal} currency={ctx.company.currency} />} hint={`${r.sessions.length} session(s) clôturée(s)`} />
      </div>
      <div className="grid gap-4">
        <Card title="Par caissier">{table(r.byCashier, "Caissier", "user")}</Card>
        <Card title="Par caisse">{table(r.byRegister, "Caisse", "register")}</Card>
        <Card title="Sessions clôturées et écarts">
          {r.sessions.length === 0 ? (
            <EmptyState title="Aucune session clôturée sur la période" />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Caisse</th><th>Caissier</th><th>Clôture</th><th className="hidden text-right md:table-cell">Attendu</th><th className="hidden text-right md:table-cell">Compté</th><th className="text-right">Écart</th></tr>
                </thead>
                <tbody>
                  {r.sessions.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/caisses/sessions/${s.id}`} className="font-medium hover:text-brand-700">{s.registerName}</Link></td>
                      <td>{s.openedByName ?? "—"}{s.forced && <> <Badge tone="amber">Forcée</Badge></>}</td>
                      <td className="whitespace-nowrap">{s.closedAt ? formatDate(s.closedAt, true) : "—"}</td>
                      <td className="hidden text-right md:table-cell">{m(s.expectedCash ?? 0)}</td>
                      <td className="hidden text-right md:table-cell">{m(s.countedCash ?? 0)}</td>
                      <td className="text-right"><DifferenceBadge value={s.difference ?? 0} currency={ctx.company.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Ventes de caisse terminées. Crédit = part non payée au moment de la vente. Les ventes annulées sont comptées à part.
      </p>
    </>
  );
}
