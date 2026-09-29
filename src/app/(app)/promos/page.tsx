import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PromoFields, promoPeriod } from "@/components/promo-fields";
import { Badge, Card, EmptyState, Field, PageHeader, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate, localDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { promoLabel, promoProblem } from "@/lib/promo";
import { listPromos } from "@/modules/promos/service";
import { deletePromoAction, savePromoAction, togglePromoAction } from "./actions";

export const metadata = { title: "Codes promo" };

export default async function PromosPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await requireContext("promos.manage");
  const { edit } = await searchParams;
  const rows = await listPromos(ctx);
  const editing = edit ? rows.find((r) => r.id === edit) : undefined;
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const currencyLabel = ctx.company.currency === "XOF" || ctx.company.currency === "XAF" ? "FCFA" : ctx.company.currency;
  const today = localDate(new Date(), ctx.company.timezone);
  return (
    <>
      <PageHeader title="Codes promo" subtitle="Codes de réduction pour vos clients : le caissier les saisit à la caisse, la réduction s'applique sur tout le panier." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={editing ? `Modifier le code ${editing.code}` : "Nouveau code"} className="xl:col-span-1">
          <ActionForm key={editing?.id ?? "new"} action={savePromoAction.bind(null, editing?.id ?? null)} className="grid gap-3" resetOnSuccess={!editing}>
            <PromoFields d={editing} currencyLabel={currencyLabel} />
            <Field
              label={`Achat minimum (${currencyLabel}, facultatif)`}
              name="minPurchase"
              inputMode="decimal"
              defaultValue={editing?.minPurchase ?? ""}
              hint="Montant du panier après les remises de ligne"
            />
            <div className="flex gap-2">
              <SubmitButton>{editing ? "Enregistrer" : "Créer le code"}</SubmitButton>
              {editing && <Link href="/promos" className="btn-secondary">Annuler</Link>}
            </div>
          </ActionForm>
        </Card>
        <Card title="Vos codes" className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="Aucun code promo pour l'instant">Créez un code, puis donnez-le à vos clients (affiche, WhatsApp…).</EmptyState>
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Réduction</th><th>Validité</th><th className="text-right">Utilisations</th><th>État</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const problem = promoProblem(r, today);
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="font-mono font-semibold">{r.code}</span>
                          {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                        </td>
                        <td className="whitespace-nowrap">
                          {promoLabel(r, m)}
                          {r.minPurchase ? <div className="text-xs text-slate-500">dès {m(r.minPurchase)} d&apos;achat</div> : null}
                        </td>
                        <td className="text-xs">{promoPeriod(r, (d) => formatDate(d))}</td>
                        <td className="text-right tabular-nums">{r.usedCount}{r.maxUses != null ? ` / ${r.maxUses}` : ""}</td>
                        <td>{problem ? <Badge tone={r.isActive ? "amber" : "gray"}>{r.isActive ? "Inutilisable" : "Désactivé"}</Badge> : <Badge tone="green">Actif</Badge>}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link href={`/promos?edit=${r.id}`} className="btn-ghost px-2 py-1 text-xs">Modifier</Link>
                            <form action={togglePromoAction.bind(null, r.id, !r.isActive)}>
                              <button className="btn-ghost px-2 py-1 text-xs">{r.isActive ? "Désactiver" : "Activer"}</button>
                            </form>
                            {r.usedCount === 0 && (
                              <ActionForm action={deletePromoAction.bind(null, r.id)} showOk={false}>
                                <ConfirmButton message={`Supprimer le code ${r.code} ?`} className="btn-ghost px-2 py-1 text-xs text-red-600">Supprimer</ConfirmButton>
                              </ActionForm>
                            )}
                          </div>
                          {problem && r.isActive && <div className="mt-1 text-right text-xs text-amber-700">{problem}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
