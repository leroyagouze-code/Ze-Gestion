import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listCashSessions, listRegisters, listRegisterStores, listSellers, uuidParam } from "@/modules/registers/service";
import { createRegisterAction, renameRegisterAction, toggleRegisterAction } from "./actions";
import { DifferenceBadge } from "./difference";

export const metadata = { title: "Caisses" };

export default async function RegistersPage({ searchParams }: { searchParams: Promise<{ page?: string; register?: string; user?: string }> }) {
  const ctx = await requireContext("sales.view");
  const sp = await searchParams;
  const seesAll = can(ctx.permissions, "sales.view_all");
  const canManage = can(ctx.permissions, "registers.manage");
  const [regs, open, history, sellers] = await Promise.all([
    listRegisters(ctx),
    listCashSessions(ctx, { status: "open" }),
    listCashSessions(ctx, { status: "closed", page: Number(sp.page), registerId: uuidParam(sp.register), userId: uuidParam(sp.user) }),
    listSellers(ctx),
  ]);
  const stores = canManage ? await listRegisterStores(ctx) : [];
  const m = (v: number | null) => (v == null ? "—" : formatMoney(v, ctx.company.currency));
  return (
    <>
      <PageHeader
        title="Caisses"
        subtitle={seesAll ? "Sessions de tous les caissiers" : "Vos sessions de caisse"}
        actions={
          <>
            <Link href="/reports/caissiers" className="btn-secondary">Ventes par caissier</Link>
            {can(ctx.permissions, "sales.create") && <Link href="/pos" className="btn-primary">Aller à la caisse</Link>}
          </>
        }
      />

      <Card title={seesAll ? "Sessions ouvertes" : "Ma session ouverte"} className="mb-4">
        {open.rows.length === 0 ? (
          <EmptyState title="Aucune session ouverte" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Caisse</th><th>Caissier</th><th>Ouverte le</th><th className="text-right">Fond</th><th /></tr></thead>
              <tbody>
                {open.rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.registerName}</td>
                    <td>{s.openedByName ?? "—"}</td>
                    <td className="whitespace-nowrap">{formatDate(s.openedAt, true)}</td>
                    <td className="text-right">{m(s.openingFloat)}</td>
                    <td className="text-right">
                      <Link href={`/caisses/sessions/${s.id}`} className="text-brand-700 hover:underline">
                        {s.openedBy === ctx.userId ? "Clôturer" : "Voir / forcer la clôture"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card title="Sessions clôturées" className="mb-4">
        <form className="mb-3 flex flex-wrap gap-2">
          <select name="register" defaultValue={sp.register ?? ""} className="input w-44" aria-label="Caisse">
            <option value="">Toutes les caisses</option>
            {regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {seesAll && (
            <select name="user" defaultValue={sp.user ?? ""} className="input w-44" aria-label="Caissier">
              <option value="">Tous les caissiers</option>
              {sellers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button className="btn-secondary">Filtrer</button>
        </form>
        {history.rows.length === 0 ? (
          <EmptyState title="Aucune session clôturée" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Caisse</th><th>Caissier</th><th>Période</th>
                  <th className="hidden text-right md:table-cell">Attendu</th><th className="hidden text-right md:table-cell">Compté</th>
                  <th className="text-right">Écart</th><th />
                </tr>
              </thead>
              <tbody>
                {history.rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.registerName}</td>
                    <td>{s.openedByName ?? "—"}{s.forced && <> <Badge tone="amber">Clôture forcée</Badge></>}</td>
                    <td className="whitespace-nowrap text-xs">{formatDate(s.openedAt, true)} → {s.closedAt ? formatDate(s.closedAt, true) : ""}</td>
                    <td className="hidden text-right md:table-cell">{m(s.expectedCash)}</td>
                    <td className="hidden text-right md:table-cell">{m(s.countedCash)}</td>
                    <td className="text-right"><DifferenceBadge value={s.difference ?? 0} currency={ctx.company.currency} /></td>
                    <td className="text-right"><Link href={`/caisses/sessions/${s.id}`} className="text-brand-700 hover:underline">Rapport Z</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={history.page} total={history.total} pageSize={history.pageSize} params={{ register: sp.register, user: sp.user }} />
      </Card>

      {canManage && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title="Caisses de l'entreprise" className="xl:col-span-2">
            {regs.length === 0 ? (
              <EmptyState title="Aucune caisse">
                Tant qu&apos;aucune caisse n&apos;est créée, on vend sans ouverture ni clôture. Dès qu&apos;une boutique a une caisse active, ses caissiers
                doivent ouvrir une session (fond de caisse) avant de vendre.
              </EmptyState>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead><tr><th>N°</th><th>Nom</th><th className="hidden md:table-cell">Boutique</th><th>État</th><th /></tr></thead>
                  <tbody>
                    {regs.map((r) => (
                      <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                        <td>{r.number}</td>
                        <td>
                          <ActionForm action={renameRegisterAction.bind(null, r.id)} className="flex items-center gap-2" showOk={false}>
                            <input name="name" defaultValue={r.name} className="input w-40" aria-label="Nom de la caisse" maxLength={60} required />
                            <SubmitButton className="btn-secondary px-3 py-1.5" pendingText="…">OK</SubmitButton>
                          </ActionForm>
                        </td>
                        <td className="hidden md:table-cell">{r.storeName}</td>
                        <td>
                          {r.openSessionId ? <Badge tone="green">Ouverte · {r.openedBy}</Badge> : r.isActive ? <Badge>Fermée</Badge> : <Badge tone="red">Désactivée</Badge>}
                        </td>
                        <td className="text-right">
                          <ActionForm action={toggleRegisterAction.bind(null, r.id, !r.isActive)} showOk={false}>
                            <button className={r.isActive ? "text-xs text-red-600 hover:underline" : "text-xs text-brand-700 hover:underline"}>
                              {r.isActive ? "Désactiver" : "Réactiver"}
                            </button>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Pour proposer d&apos;office une caisse à un caissier, choisissez-la dans <Link href="/users" className="text-brand-700 hover:underline">Utilisateurs</Link>.
            </p>
          </Card>
          <Card title="Ajouter une caisse">
            <ActionForm action={createRegisterAction} className="space-y-3" resetOnSuccess>
              <div>
                <label className="label" htmlFor="name">Nom</label>
                <input id="name" name="name" className="input" placeholder={`Caisse ${regs.length + 1}`} maxLength={60} />
                <p className="mt-1 text-xs text-slate-500">Laissez vide pour « Caisse N » (numéro suivant).</p>
              </div>
              {stores.length > 1 ? (
                <div>
                  <label className="label" htmlFor="storeId">Boutique</label>
                  <select id="storeId" name="storeId" className="input" defaultValue={ctx.storeId}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ) : (
                <input type="hidden" name="storeId" value={ctx.storeId} />
              )}
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
