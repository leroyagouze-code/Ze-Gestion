import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Card, EmptyState, ListLink, List, Money, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { capitalize, dayMonth, monthLabel } from "@/modules/finance/dates";
import { filterOptions, staffOverview } from "@/modules/dashboard/service";
import { ArrearsList } from "../impayes/arrears-list";

export const metadata: Metadata = { title: "Accueil" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ proprietaire?: string; bien?: string; mois?: string; bienvenue?: string }> }) {
  const ctx = await requireStaff("dashboard.view");
  const sp = await searchParams;
  const f = { ownerId: sp.proprietaire || undefined, propertyId: sp.bien || undefined, month: sp.mois || undefined };
  const [o, opts] = await Promise.all([staffOverview(ctx, f), filterOptions(ctx)]);
  const isAgency = ctx.orgKind === "AGENCY" && !ctx.ownerId;
  const canPay = can(ctx.permissions, "payment.write");
  const first = ctx.userName.split(" ")[0];
  const empty = o.units.total === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Bonjour {first} 👋</h1>
        <p className="text-[15px] text-stone-600">{ctx.orgName}</p>
      </div>

      {empty ? (
        <Card>
          <EmptyState icon="🏠" title="Bienvenue sur ZE LOYER" action={can(ctx.permissions, "property.write") && <Link href="/biens/nouveau" className="btn-primary">Ajouter mon premier bien</Link>}>
            <ol className="mt-2 space-y-1 text-left">
              <li>1. Ajoutez un bien (immeuble, maison, cour…)</li>
              <li>2. Ajoutez ses logements et leur loyer</li>
              <li>3. Ajoutez vos locataires et invitez-les</li>
              <li>4. Enregistrez les paiements : les quittances se font toutes seules</li>
            </ol>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* La question principale : qui me doit de l'argent ? */}
          {o.arrears.length > 0 ? (
            <Card
              title={<span className="text-red-800">🔴 Qui me doit de l&apos;argent ?</span>}
              action={
                <Link href="/impayes" className="text-[14px] font-semibold text-brand-700 underline">
                  Tout voir
                </Link>
              }
              padded={false}
              className="border-red-200"
            >
              <div className="flex items-baseline justify-between px-4 pt-4">
                <span className="text-[15px] text-stone-700">
                  {o.arrears.length} locataire{o.arrears.length > 1 ? "s" : ""} en retard
                </span>
                <Money value={o.arrearsTotal} className="text-2xl font-extrabold text-red-800" />
              </div>
              <ArrearsList items={o.arrears.slice(0, 3)} canPay={canPay} />
            </Card>
          ) : (
            <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
              <span className="text-3xl" aria-hidden>🟢</span>
              <div>
                <p className="text-lg font-bold text-emerald-900">Personne ne vous doit d&apos;argent</p>
                <p className="text-[14px] text-emerald-800">Tous les loyers échus sont payés.</p>
              </div>
            </div>
          )}

          {canPay && (
            <div className="grid grid-cols-2 gap-3">
              <Link href="/paiements/nouveau" className="btn-primary">
                <Plus className="h-5 w-5" aria-hidden /> Paiement
              </Link>
              {can(ctx.permissions, "tenant.write") ? (
                <Link href="/locataires/nouveau" className="btn-secondary">
                  <Plus className="h-5 w-5" aria-hidden /> Locataire
                </Link>
              ) : (
                <Link href="/impayes" className="btn-secondary">
                  Impayés
                </Link>
              )}
            </div>
          )}

          {isAgency && (
            <form className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4" aria-label="Filtres">
              <select name="proprietaire" defaultValue={f.ownerId ?? ""} className="input" aria-label="Propriétaire">
                <option value="">Tous les propriétaires</option>
                {opts.owners.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <select name="bien" defaultValue={f.propertyId ?? ""} className="input" aria-label="Immeuble">
                <option value="">Tous les immeubles</option>
                {opts.properties
                  .filter((p) => !f.ownerId || p.ownerId === f.ownerId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
              <input type="month" name="mois" defaultValue={o.month} className="input" aria-label="Période" />
              <button className="btn-secondary">Filtrer</button>
            </form>
          )}

          <section>
            <h2 className="mb-2 text-[17px] font-bold">{isAgency ? "Vue globale" : "Mon patrimoine"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {isAgency && <Stat label="Propriétaires" value={o.owners} href="/proprietaires" />}
              {isAgency && <Stat label="Immeubles" value={o.properties} href="/biens" />}
              <Stat label="Logements" value={o.units.total} href="/biens" />
              <Stat label="🟢 Occupés" value={o.units.occupied} tone="green" />
              <Stat label={isAgency ? "🔴 Vacants" : "🟠 À venir"} value={isAgency ? o.units.vacant : o.upcoming.length} tone={isAgency ? "red" : "orange"} hint={isAgency ? undefined : "échéances sous 7 jours"} />
              <Stat label="🔴 Impayés" value={o.arrears.length} tone="red" href="/impayes" />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[17px] font-bold">Revenus · {capitalize(monthLabel(`${o.month}-01`))}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Loyers attendus" value={<Money value={o.revenue.expected} />} />
              <Stat label="Loyers encaissés" value={<Money value={o.revenue.collected} />} tone="green" />
              <Stat label="À récupérer" value={<Money value={o.revenue.toRecover} />} tone={o.revenue.toRecover > 0 ? "red" : "green"} />
            </div>
            <p className="mt-2 text-[13px] text-stone-500">
              Argent reçu ce mois-ci (loyers, avances, cautions…) : <Money value={o.cashIn.total} className="font-semibold" />
            </p>
          </section>

          <Card title="Actions" padded={false}>
            <List>
              <ListLink href="/impayes" title={`🔴 ${o.arrears.length} loyer${o.arrears.length > 1 ? "s" : ""} en retard`} subtitle="Relancer ou enregistrer un paiement" />
              <ListLink href="#echeances" title={`🟠 ${o.upcoming.length} échéance${o.upcoming.length > 1 ? "s" : ""} proche${o.upcoming.length > 1 ? "s" : ""}`} subtitle="Dans les 7 prochains jours" />
              {o.tenantsAhead > 0 && <ListLink href="/locataires?statut=EN_AVANCE" title={`🔵 ${o.tenantsAhead} locataire${o.tenantsAhead > 1 ? "s" : ""} en avance`} subtitle="Loyers déjà payés pour les mois à venir" />}
            </List>
          </Card>

          <Card title="🟠 Échéances proches" padded={false}>
            <div id="echeances" />
            {o.upcoming.length ? (
              <List>
                {o.upcoming.map((u) => (
                  <ListLink
                    key={u.leaseId}
                    href={`/locations/${u.leaseId}`}
                    title={u.tenantName}
                    subtitle={`${u.unitLabel} · ${u.propertyName}`}
                    right={
                      <>
                        <Money value={u.amount} className="font-bold" />
                        <span className="text-[13px] text-amber-800">{u.inDays === 0 ? "Aujourd'hui" : `le ${dayMonth(u.dueDate)}`}</span>
                      </>
                    }
                  />
                ))}
              </List>
            ) : (
              <EmptyState title="Aucune échéance dans les 7 prochains jours" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
