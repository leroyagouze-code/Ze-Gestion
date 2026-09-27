import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Badge, Card, EmptyState, Money, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { capitalize, endOfMonth, monthLabel, shortDate, todayISO } from "@/modules/finance/dates";
import { METHOD_LABELS, TYPE_LABELS, toOptions } from "@/modules/finance/labels";
import type { TransactionType } from "@/modules/finance/ledger";
import { filterOptions } from "@/modules/dashboard/service";
import { listPayments } from "@/modules/finance/service";

export const metadata: Metadata = { title: "Paiements" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mois?: string; type?: string; q?: string; proprietaire?: string; bien?: string }> }) {
  const ctx = await requireStaff("payment.read");
  const sp = await searchParams;
  const month = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : todayISO().slice(0, 7);
  const type = sp.type && sp.type in TYPE_LABELS ? (sp.type as TransactionType) : undefined;
  const [rows, opts] = await Promise.all([
    listPayments(ctx, { from: `${month}-01`, to: endOfMonth(`${month}-01`), type, q: sp.q?.trim() || undefined, ownerId: sp.proprietaire || undefined, propertyId: sp.bien || undefined, limit: 300 }),
    filterOptions(ctx),
  ]);
  const valid = rows.filter((r) => r.payment.status === "VALID");
  const total = valid.reduce((s, r) => s + (r.payment.type === "REMBOURSEMENT" ? 0 : Math.max(0, r.payment.amount)), 0);
  const isAgency = ctx.orgKind === "AGENCY" && !ctx.ownerId;
  return (
    <>
      <PageHeader
        title="Paiements"
        subtitle={
          <>
            {capitalize(monthLabel(`${month}-01`))} · {valid.length} paiement{valid.length > 1 ? "s" : ""} · <Money value={total} className="font-semibold text-ink" />
          </>
        }
        actions={
          can(ctx.permissions, "payment.write") && (
            <Link href="/paiements/nouveau" className="btn-primary">
              <Plus className="h-5 w-5" aria-hidden /> Enregistrer un paiement
            </Link>
          )
        }
      />
      <form className="card mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-5" aria-label="Filtres">
        <input type="month" name="mois" defaultValue={month} className="input" aria-label="Mois" />
        <select name="type" defaultValue={type ?? ""} className="input" aria-label="Type">
          <option value="">Tous les types</option>
          {toOptions(TYPE_LABELS).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isAgency && (
          <select name="proprietaire" defaultValue={sp.proprietaire ?? ""} className="input" aria-label="Propriétaire">
            <option value="">Tous les propriétaires</option>
            {opts.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select name="bien" defaultValue={sp.bien ?? ""} className="input" aria-label="Immeuble">
          <option value="">Tous les biens</option>
          {opts.properties.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Locataire ou logement" className="input col-span-2 sm:col-span-1" aria-label="Locataire" />
        <button className="btn-secondary col-span-2 sm:col-span-5">Filtrer</button>
      </form>
      <Card padded={false}>
        {rows.length ? (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.payment.id}>
                <Link href={`/paiements/${r.payment.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.tenantName}</p>
                    <p className="truncate text-[14px] text-stone-600">
                      {TYPE_LABELS[r.payment.type]} · {r.unitLabel} · {shortDate(r.payment.paidAt)} · {METHOD_LABELS[r.payment.method]}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money value={r.payment.amount} className={r.payment.status === "CANCELLED" ? "font-bold text-stone-400 line-through" : "font-bold"} />
                    {r.payment.status === "CANCELLED" ? <Badge tone="gray">Annulé</Badge> : r.receiptNumber ? <span className="text-[12px] text-stone-500">🧾 {r.receiptNumber}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="💰" title="Aucun paiement sur cette période" />
        )}
      </Card>
    </>
  );
}
