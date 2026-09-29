import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getCashSession } from "@/modules/registers/service";
import { closeSessionAction } from "../../actions";
import { DifferenceBadge } from "../../difference";

export const metadata = { title: "Session de caisse" };

export default async function CashSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("sales.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await getCashSession(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const own = s.openedBy === ctx.userId;
  const canClose = s.status === "open" && (own ? can(ctx.permissions, "sales.create") : can(ctx.permissions, "sales.view_all"));
  const sum = s.summary;
  return (
    <>
      <PageHeader
        title={`${s.registerName} · ${s.status === "open" ? "session ouverte" : "rapport Z"}`}
        subtitle={`${s.openedByName ?? "—"} · ${s.storeName} · ouverte le ${formatDate(s.openedAt, true)}${s.closedAt ? ` · clôturée le ${formatDate(s.closedAt, true)}` : ""}`}
        actions={
          <div className="no-print flex gap-2">
            <Link href="/caisses" className="btn-secondary">Caisses</Link>
            <Link href={`/sales?session=${s.id}`} className="btn-secondary">Ventes de la session</Link>
            {s.status === "closed" && <a href={`/api/cash-sessions/${s.id}/z`} target="_blank" className="btn-secondary">Rapport Z (PDF)</a>}
            <PrintButton />
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventes" value={sum.salesCount} hint={`Panier moyen : ${m(sum.salesCount ? sum.salesTotal / sum.salesCount : 0)}`} />
        <Stat label="Chiffre d'affaires" value={m(sum.salesTotal)} hint={sum.discountTotal > 0 ? `Remises : ${m(sum.discountTotal)}` : undefined} />
        <Stat label="Annulations" value={sum.cancelledCount} hint={sum.cancelledCount ? m(sum.cancelledTotal) : undefined} tone={sum.cancelledCount ? "warn" : "default"} />
        <Stat label="Ventes à crédit" value={m(sum.creditTotal)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Encaissements par moyen de paiement">
          <TableWrap>
            <table className="table">
              <thead><tr><th>Moyen</th><th className="text-right">Nb</th><th className="text-right">Montant</th></tr></thead>
              <tbody>
                {sum.byMethod.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500">Aucun encaissement</td></tr>}
                {sum.byMethod.map((x) => (
                  <tr key={x.method}><td>{x.method}</td><td className="text-right">{x.count}</td><td className="text-right">{m(x.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Espèces">
          <table className="table">
            <tbody>
              <tr><td>Fond de caisse</td><td className="text-right">{m(s.openingFloat)}</td></tr>
              <tr><td>Encaissements en espèces</td><td className="text-right">+ {m(sum.cashIn)}</td></tr>
              <tr className="font-semibold"><td>Espèces attendues</td><td className="text-right">{m(s.expectedCash)}</td></tr>
              {s.status === "closed" && (
                <>
                  <tr><td>Espèces comptées</td><td className="text-right">{m(s.countedCash ?? 0)}</td></tr>
                  <tr><td>Écart</td><td className="text-right"><DifferenceBadge value={s.difference ?? 0} currency={ctx.company.currency} /></td></tr>
                </>
              )}
            </tbody>
          </table>
          {s.status === "closed" && (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Clôturée par {s.closedByName ?? "—"} {s.forced && <Badge tone="amber">Clôture forcée</Badge>}</p>
              {s.closingNotes && <p>Note : {s.closingNotes}</p>}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Les ventes annulées sont considérées comme remboursées : leur argent ne compte plus dans la caisse.</p>
        </Card>
      </div>
      {canClose && (
        <div className="no-print mt-4 max-w-lg">
          <Card title={own ? "Clôturer ma caisse" : `Forcer la clôture (caisse de ${s.openedByName ?? "—"})`}>
            <ActionForm action={closeSessionAction.bind(null, s.id)} className="space-y-3" showOk={false}>
              <div>
                <label className="label" htmlFor="countedCash">Espèces comptées dans le tiroir</label>
                <input id="countedCash" name="countedCash" inputMode="decimal" className="input text-lg" required autoComplete="off" />
                <p className="mt-1 text-xs text-slate-500">Comptez billets et pièces, fond de caisse compris. L&apos;écart avec les {m(s.expectedCash)} attendus sera enregistré.</p>
              </div>
              <div>
                <label className="label" htmlFor="notes">Note (facultatif)</label>
                <textarea id="notes" name="notes" rows={2} maxLength={500} className="input" />
              </div>
              <SubmitButton className="btn-primary w-full py-3" pendingText="Clôture…">Clôturer la caisse</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
