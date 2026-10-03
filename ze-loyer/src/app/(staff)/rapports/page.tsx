import type { Metadata } from "next";
import { Card, Money, PageHeader, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { capitalize, monthLabel } from "@/modules/finance/dates";
import { METHOD_LABELS, TYPE_LABELS, type PaymentMethod } from "@/modules/finance/labels";
import type { TransactionType } from "@/modules/finance/ledger";
import { filterOptions, report } from "@/modules/dashboard/service";

export const metadata: Metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mois?: string; proprietaire?: string; bien?: string }> }) {
  const ctx = await requireStaff("report.read");
  const sp = await searchParams;
  const f = { month: sp.mois, ownerId: sp.proprietaire || undefined, propertyId: sp.bien || undefined };
  const [r, opts] = await Promise.all([report(ctx, f), filterOptions(ctx)]);
  const max = Math.max(1, ...r.months.map((m) => m.expected));
  const rate = r.current.expected ? Math.round((r.current.collected / r.current.expected) * 100) : 100;
  const isAgency = ctx.orgKind === "AGENCY" && !ctx.ownerId;
  return (
    <>
      <PageHeader title="Rapports" subtitle={capitalize(monthLabel(`${r.month}-01`))} />
      <form className="card mb-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4" aria-label="Filtres">
        <input type="month" name="mois" defaultValue={r.month} className="input" aria-label="Mois" />
        {isAgency && (
          <select name="proprietaire" defaultValue={f.ownerId ?? ""} className="input" aria-label="Propriétaire">
            <option value="">Tous les propriétaires</option>
            {opts.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select name="bien" defaultValue={f.propertyId ?? ""} className="input" aria-label="Immeuble">
          <option value="">Tous les biens</option>
          {opts.properties.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Afficher</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Loyers attendus" value={<Money value={r.current.expected} />} />
        <Stat label="Loyers encaissés" value={<Money value={r.current.collected} />} tone="green" hint={`${rate} % encaissés`} />
        <Stat label="À récupérer (mois)" value={<Money value={r.current.toRecover} />} tone={r.current.toRecover ? "red" : "green"} />
        <Stat label="Total des impayés" value={<Money value={r.arrearsTotal} />} tone={r.arrearsTotal ? "red" : "green"} hint={`Avances détenues : ${new Intl.NumberFormat("fr-FR").format(r.advanceTotal)} F`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="6 derniers mois : attendu / encaissé">
          <ul className="space-y-3" aria-label="Évolution sur 6 mois">
            {r.months.map((m) => (
              <li key={m.key}>
                <div className="flex justify-between text-[14px]">
                  <span className="font-semibold">{capitalize(monthLabel(`${m.key}-01`))}</span>
                  <span className="tabular-nums text-stone-600">
                    <Money value={m.collected} className="font-semibold text-ink" /> / <Money value={m.expected} />
                  </span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-sand-100" role="img" aria-label={`${m.collected} encaissés sur ${m.expected}`}>
                  <div className="h-full rounded-full bg-sand-200" style={{ width: `${(m.expected / max) * 100}%` }}>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${m.expected ? (m.collected / m.expected) * 100 : 0}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Argent reçu ce mois-ci">
          <p className="mb-3 text-[28px] font-extrabold">
            <Money value={r.cashIn.total} unit="FCFA" />
          </p>
          <p className="text-[14px] font-semibold text-stone-600">Par type</p>
          <ul className="mb-4 mt-1 space-y-1">
            {Object.entries(r.cashIn.byType).map(([k, v]) => (
              <li key={k} className="flex justify-between text-[15px]">
                <span>{TYPE_LABELS[k as TransactionType]}</span>
                <Money value={v} className="font-semibold" />
              </li>
            ))}
            {!Object.keys(r.cashIn.byType).length && <li className="text-stone-500">Rien ce mois-ci.</li>}
          </ul>
          <p className="text-[14px] font-semibold text-stone-600">Par mode de paiement</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(r.cashIn.byMethod).map(([k, v]) => (
              <li key={k} className="flex justify-between text-[15px]">
                <span>{METHOD_LABELS[k as PaymentMethod]}</span>
                <Money value={v} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Par bien" padded={false} className="lg:col-span-2">
          <ul className="divide-y divide-sand-100">
            {r.byProperty.map((p) => (
              <li key={p.name} className="px-4 py-3">
                <p className="font-semibold">{p.name}</p>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[14px]">
                  <span>
                    <span className="block text-stone-500">Attendu</span>
                    <Money value={p.expected} className="font-semibold" />
                  </span>
                  <span>
                    <span className="block text-stone-500">Encaissé</span>
                    <Money value={p.collected} className="font-semibold text-emerald-800" />
                  </span>
                  <span>
                    <span className="block text-stone-500">Impayés</span>
                    <Money value={p.arrears} className={p.arrears ? "font-semibold text-red-800" : "font-semibold"} />
                  </span>
                </div>
              </li>
            ))}
            {!r.byProperty.length && <li className="p-4 text-stone-500">Aucune donnée.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
