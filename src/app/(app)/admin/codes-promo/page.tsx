import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PromoFields, promoPeriod } from "@/components/promo-fields";
import { Badge, Card, EmptyState, PageHeader, SelectField, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { promoLabel, promoProblem } from "@/lib/promo";
import { LICENSE_MIN_AMOUNT, listPlatformPromos, platformToday, PROMO_PLANS, PROMO_SCOPES } from "@/modules/billing/platform-promos";
import { deletePlatformPromoAction, savePlatformPromoAction, togglePlatformPromoAction } from "../actions";

export const metadata = { title: "Codes promo de la plateforme" };
export const dynamic = "force-dynamic";

const F = (n: number) => formatMoney(n, "XOF");

export default async function PlatformPromosPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const { edit } = await searchParams;
  const rows = await listPlatformPromos(s);
  const editing = edit ? rows.find((r) => r.id === edit) : undefined;
  const today = platformToday();
  return (
    <>
      <PageHeader
        title="Codes promo"
        subtitle="Réductions pour les clients de ZE Gestion : achats de licence en ligne et paiements d'abonnement."
        actions={
          <>
            <Link href="/admin/licences" className="btn-secondary">Licences</Link>
            <Link href="/admin" className="btn-secondary">Retour</Link>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={editing ? `Modifier le code ${editing.code}` : "Nouveau code"} className="xl:col-span-1">
          <ActionForm key={editing?.id ?? "new"} action={savePlatformPromoAction.bind(null, editing?.id ?? null)} className="grid gap-3" resetOnSuccess={!editing}>
            <PromoFields d={editing} />
            <SelectField label="S'applique à" name="scope" defaultValue={editing?.scope ?? "all"} options={Object.entries(PROMO_SCOPES).map(([value, label]) => ({ value, label }))} />
            <fieldset>
              <legend className="label">Formules concernées</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {PROMO_PLANS.map((p) => (
                  <label key={p} className="flex items-center gap-1">
                    <input type="checkbox" name="plans" value={p} defaultChecked={editing?.plans.includes(p)} className="accent-brand-700" /> {p}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Aucune case cochée : toutes les formules.</p>
            </fieldset>
            <p className="text-xs text-slate-500">
              Le prix réduit est toujours recalculé par le serveur. Une licence achetée en ligne coûte au moins {F(LICENSE_MIN_AMOUNT)}, même avec un code.
            </p>
            <div className="flex gap-2">
              <SubmitButton>{editing ? "Enregistrer" : "Créer le code"}</SubmitButton>
              {editing && <Link href="/admin/codes-promo" className="btn-secondary">Annuler</Link>}
            </div>
          </ActionForm>
        </Card>
        <Card title="Codes" className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="Aucun code promo pour l'instant" />
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
                          {promoLabel(r, F)}
                          <div className="text-xs text-slate-500">{PROMO_SCOPES[r.scope as keyof typeof PROMO_SCOPES] ?? r.scope}{r.plans.length ? ` · ${r.plans.join(", ")}` : ""}</div>
                        </td>
                        <td className="text-xs">{promoPeriod(r, (d) => formatDate(d))}</td>
                        <td className="text-right tabular-nums">{r.usedCount}{r.maxUses != null ? ` / ${r.maxUses}` : ""}</td>
                        <td>{problem ? <Badge tone={r.isActive ? "amber" : "gray"}>{r.isActive ? "Inutilisable" : "Désactivé"}</Badge> : <Badge tone="green">Actif</Badge>}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link href={`/admin/codes-promo?edit=${r.id}`} className="btn-ghost px-2 py-1 text-xs">Modifier</Link>
                            <form action={togglePlatformPromoAction.bind(null, r.id, !r.isActive)}>
                              <button className="btn-ghost px-2 py-1 text-xs">{r.isActive ? "Désactiver" : "Activer"}</button>
                            </form>
                            {r.usedCount === 0 && (
                              <ActionForm action={deletePlatformPromoAction.bind(null, r.id)} showOk={false}>
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
