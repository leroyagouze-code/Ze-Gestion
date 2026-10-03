import Link from "next/link";
import type { Metadata } from "next";
import { Card, List, ListLink, Money, SituationBadge } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { dayMonth, longDate, shortDate } from "@/modules/finance/dates";
import { TYPE_LABELS, UNIT_TYPE_LABELS } from "@/modules/finance/labels";
import { tenantOverview } from "@/modules/portal/service";
import { NoLease } from "./no-lease";

export const metadata: Metadata = { title: "Accueil" };

export default async function TenantHome({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const ctx = await requireTenant();
  const { location } = await searchParams;
  const o = await tenantOverview(ctx.userId, location && /^[0-9a-f-]{36}$/.test(location) ? location : undefined).catch(() => tenantOverview(ctx.userId));
  const first = ctx.userName.split(" ")[0];
  if (!o.current || !o.situation) {
    return (
      <div className="space-y-5">
        <h1 className="text-[26px] font-extrabold">Bonjour {first} 👋</h1>
        <NoLease phone={ctx.phone} />
      </div>
    );
  }
  const { lease, unit, property } = o.current;
  const s = o.situation;
  const recent = o.payments.filter((p) => p.payment.status === "VALID").slice(0, 3);
  const tone = s.status === "EN_RETARD" ? "border-red-200 bg-red-50" : s.status === "EN_AVANCE" ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50";
  return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-extrabold">Bonjour {first} 👋</h1>

      {o.all.length > 1 && (
        <form className="flex gap-2">
          <select name="location" defaultValue={lease.id} className="input" aria-label="Choisir le logement">
            {o.all.map((l) => (
              <option key={l.lease.id} value={l.lease.id}>
                {l.unit.label} · {l.property.name} {l.lease.status === "ENDED" ? "(terminée)" : ""}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Voir</button>
        </form>
      )}

      {/* En moins de 10 secondes : est-ce que mon loyer est à jour ? */}
      <Link href="/mon-espace/carnet" className={`card block border-2 p-5 ${tone}`}>
        <p className="text-[14px] font-semibold text-stone-600">💰 Ma situation</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[24px] font-extrabold leading-tight">
            {s.status === "EN_RETARD" ? "🔴 Vous avez un solde" : s.status === "EN_AVANCE" ? "🔵 Vous êtes en avance" : "🟢 Vous êtes à jour"}
          </p>
        </div>
        {s.status === "EN_RETARD" && <Money value={s.overdueAmount} unit="FCFA" className="mt-1 block text-[30px] font-extrabold text-red-800" />}
        {s.status === "EN_AVANCE" && s.coveredUntil && <p className="mt-1 text-[16px] text-sky-900">Loyer couvert jusqu&apos;au <strong>{longDate(s.coveredUntil)}</strong></p>}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-black/5 pt-3">
          <div>
            <p className="text-[14px] text-stone-600">Loyer</p>
            <Money value={lease.rentAmount} className="text-[19px] font-bold" />
          </div>
          <div>
            <p className="text-[14px] text-stone-600">Prochaine échéance</p>
            <p className="text-[19px] font-bold">{s.nextDue ? dayMonth(s.nextDue.date) : "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-[15px] font-semibold text-brand-700">Ouvrir mon carnet →</p>
      </Link>

      <Card title="🏠 Mon logement">
        <p className="text-[18px] font-bold">
          {UNIT_TYPE_LABELS[unit.type]} {unit.label}
        </p>
        <p className="text-[15px] text-stone-700">
          {property.name}
          {property.district ? ` · ${property.district}` : ""} · {property.city}
        </p>
        {property.address && <p className="text-[14px] text-stone-600">{property.address}</p>}
        <p className="mt-2 text-[14px] text-stone-600">
          {o.orgName ? (
            <>
              Géré par <strong>{o.orgName}</strong>
            </>
          ) : (
            <>
              Propriétaire : <strong>{o.ownerName}</strong>
            </>
          )}
        </p>
      </Card>

      <Card title="Mon historique" action={<Link href="/mon-espace/carnet" className="text-[14px] font-semibold text-brand-700 underline">Tout voir</Link>} padded={false}>
        {recent.length ? (
          <ul className="divide-y divide-sand-100">
            {recent.map((p) => (
              <li key={p.payment.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold">{TYPE_LABELS[p.payment.type]}</p>
                  <p className="text-[14px] text-stone-600">Payé le {shortDate(p.payment.paidAt)}</p>
                </div>
                <Money value={p.payment.amount} className="font-bold" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-[15px] text-stone-600">Aucun paiement enregistré pour le moment.</p>
        )}
      </Card>

      <Card padded={false}>
        <List>
          <ListLink href="/mon-espace/quittances" title="🧾 Mes quittances" subtitle={`${o.receipts.length} disponible${o.receipts.length > 1 ? "s" : ""}`} />
          <ListLink href="/mon-espace/documents" title="📄 Mon contrat" />
          <ListLink href="/mon-espace/demandes" title="🔧 Signaler un problème" />
        </List>
      </Card>
      <p className="text-center text-[13px] text-stone-500">
        <SituationBadge status={s.status} /> · Mis à jour en temps réel par votre agence / propriétaire
      </p>
    </div>
  );
}
