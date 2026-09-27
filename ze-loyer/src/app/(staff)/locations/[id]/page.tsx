import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { HistoryList, SituationPanel } from "@/components/carnet";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Money, Notice, PageHeader, Row, SelectField } from "@/components/ui";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { getScopedLease } from "@/modules/access";
import { longDate, shortDate, todayISO } from "@/modules/finance/dates";
import { DEPOSIT_STATUS_LABELS, METHOD_LABELS, PERIODICITY_LABELS, TYPE_LABELS, UNIT_TYPE_LABELS } from "@/modules/finance/labels";
import { listDeposits, listPayments, loadLedgers, syncLeases } from "@/modules/finance/service";
import { listLeaseDocuments } from "@/modules/documents/service";
import { RemindButton } from "../../impayes/remind-button";
import { inviteTenantAction } from "../../locataires/actions";
import { InvitePanel } from "../../locataires/invite-panel";
import { closeDepositAction, endLeaseAction, uploadDocumentAction } from "../actions";

export const metadata: Metadata = { title: "Location" };

export default async function LeasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nouveau?: string; tout?: string }> }) {
  const ctx = await requireStaff("tenant.read");
  const { id } = await params;
  const sp = await searchParams;
  const { lease, unit, property, tenant } = await found(getScopedLease(ctx, id));
  await syncLeases([lease]);
  const s = (await loadLedgers(db, [lease])).get(lease.id)!;
  const [pays, deps, docs] = await Promise.all([listPayments(ctx, { leaseId: lease.id, limit: 200 }), listDeposits(lease.id), listLeaseDocuments(lease.id)]);
  const paymentIds = pays.map((p) => p.payment.id);
  const history = await db
    .select({ summary: auditLogs.summary, createdAt: auditLogs.createdAt, userName: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.organizationId, ctx.orgId), or(eq(auditLogs.entityId, lease.id), paymentIds.length ? inArray(auditLogs.entityId, paymentIds) : undefined)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(30);
  const p = ctx.permissions;
  const canPay = can(p, "payment.write") && lease.status === "ACTIVE";
  const today = todayISO();

  return (
    <>
      <PageHeader
        title={tenant.fullName}
        subtitle={`${unit.label} · ${property.name}${property.district ? ` · ${property.district}` : ""}`}
        back={{ href: "/locataires", label: "Mes locataires" }}
      />
      {sp.nouveau && (
        <div className="mb-4">
          <Notice tone="green" title="✅ Location créée">
            Les loyers seront calculés automatiquement chaque mois. Invitez maintenant {tenant.fullName.split(" ")[0]} à rejoindre son espace.
          </Notice>
        </div>
      )}
      {lease.status === "ENDED" && (
        <div className="mb-4">
          <Notice tone="gray">Location terminée le {lease.endDate ? longDate(lease.endDate) : "—"}.</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <SituationPanel s={s} rent={lease.rentAmount} perspective="staff" />
          {canPay && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link href={`/paiements/nouveau?location=${lease.id}`} className="btn-primary">
                💰 Enregistrer un paiement
              </Link>
              {s.amountDue > 0 && <RemindButton leaseId={lease.id} />}
            </div>
          )}

          <Card
            title="📒 Carnet — historique"
            padded={false}
            action={
              !sp.tout &&
              s.lines.length > 6 && (
                <Link href={`/locations/${lease.id}?tout=1`} className="text-[14px] font-semibold text-brand-700 underline">
                  Tout voir
                </Link>
              )
            }
          >
            <HistoryList s={s} limit={sp.tout ? undefined : 6} />
          </Card>

          <Card title="💰 Paiements" padded={false}>
            {pays.length ? (
              <ul className="divide-y divide-sand-100">
                {pays.map((r) => (
                  <li key={r.payment.id}>
                    <Link href={`/paiements/${r.payment.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {TYPE_LABELS[r.payment.type]} · {shortDate(r.payment.paidAt)}
                        </p>
                        <p className="truncate text-[14px] text-stone-600">
                          {METHOD_LABELS[r.payment.method]}
                          {r.receiptNumber ? ` · ${r.receiptNumber}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Money value={r.payment.amount} className={r.payment.status === "CANCELLED" ? "font-bold text-stone-400 line-through" : "font-bold"} />
                        {r.payment.status === "CANCELLED" && <Badge tone="gray">Annulé</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[15px] text-stone-600">Aucun paiement enregistré.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card title="🏠 Location">
            <dl className="divide-y divide-sand-100">
              <Row label="Logement">
                {unit.label} · {UNIT_TYPE_LABELS[unit.type]}
              </Row>
              <Row label="Loyer">
                <Money value={lease.rentAmount} /> ({PERIODICITY_LABELS[lease.periodicity].toLowerCase()})
              </Row>
              <Row label="Échéance">le {lease.dueDay}</Row>
              <Row label="Entrée">{shortDate(lease.startDate)}</Row>
              <Row label="Téléphone">
                <a href={`tel:${tenant.phone}`} className="text-brand-700 underline">
                  {formatPhone(tenant.phone)}
                </a>
              </Row>
            </dl>
            <div className="mt-3">
              <Link href={`/locataires/${tenant.id}`} className="text-[15px] font-semibold text-brand-700 underline">
                Fiche du locataire
              </Link>
            </div>
          </Card>

          {!tenant.userId && can(p, "invite.send") && (
            <Card title="📲 Espace du locataire">
              <p className="mb-3 text-[15px] text-stone-700">{tenant.fullName.split(" ")[0]} n&apos;a pas encore son espace ZE LOYER.</p>
              <InvitePanel action={inviteTenantAction.bind(null, tenant.id)} />
            </Card>
          )}

          <Card title="🔐 Caution">
            {deps.length ? (
              <ul className="space-y-4">
                {deps.map((d) => (
                  <li key={d.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Money value={d.amount} className="text-lg font-bold" />
                      <Badge tone={d.status === "DEPOSITED" ? "blue" : d.status === "RETAINED" ? "orange" : "green"}>{DEPOSIT_STATUS_LABELS[d.status]}</Badge>
                    </div>
                    <p className="text-[14px] text-stone-600">Versée le {shortDate(d.depositedAt)}</p>
                    {d.status !== "DEPOSITED" && (
                      <p className="text-[14px] text-stone-700">
                        Remboursé <Money value={d.refundedAmount} /> · retenu <Money value={d.retainedAmount} />
                        {d.closedAt ? ` · le ${shortDate(d.closedAt)}` : ""}
                        {d.comment ? ` — ${d.comment}` : ""}
                      </p>
                    )}
                    {d.status === "DEPOSITED" && can(p, "deposit.write") && (
                      <details className="rounded-xl border border-sand-200 p-3">
                        <summary className="cursor-pointer text-[15px] font-semibold text-brand-700">Rembourser / retenir</summary>
                        <ActionForm action={closeDepositAction.bind(null, lease.id)} className="mt-3 space-y-3">
                          <input type="hidden" name="depositId" value={d.id} />
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Remboursé" name="refundedAmount" inputMode="numeric" defaultValue={d.amount} required />
                            <Field label="Retenu" name="retainedAmount" inputMode="numeric" defaultValue={0} required />
                          </div>
                          <Field label="Date" name="closedAt" type="date" defaultValue={today} required />
                          <Field label="Commentaire" name="comment" placeholder="Obligatoire en cas de retenue" />
                          <SubmitButton className="btn-secondary w-full">Clôturer la caution</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-stone-600">
                Aucune caution enregistrée.{" "}
                {canPay && (
                  <Link href={`/paiements/nouveau?location=${lease.id}&type=CAUTION`} className="font-semibold text-brand-700 underline">
                    Enregistrer une caution
                  </Link>
                )}
              </p>
            )}
          </Card>

          <Card title="📄 Documents">
            {docs.length > 0 && (
              <ul className="mb-4 space-y-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a href={`/api/documents/${d.id}`} target="_blank" className="flex min-h-11 items-center justify-between rounded-xl border border-sand-200 px-3 hover:bg-sand-50">
                      <span className="font-semibold">{d.kind === "CONTRACT" ? "📄" : d.kind === "PROOF" ? "🧾" : "📎"} {d.title}</span>
                      <span className="text-[13px] text-stone-500">{shortDate(d.createdAt.toISOString().slice(0, 10))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {can(p, "document.write") ? (
              <ActionForm action={uploadDocumentAction.bind(null, lease.id)} resetOnSuccess className="space-y-3">
                <SelectField label="Type" name="kind" options={[{ value: "CONTRACT", label: "Contrat de location" }, { value: "OTHER", label: "Autre document" }]} />
                <Field label="Titre" name="title" placeholder="Contrat de location" />
                <Field label="Fichier (PDF ou photo, 5 Mo max.)" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                <SubmitButton className="btn-secondary w-full">Ajouter le document</SubmitButton>
              </ActionForm>
            ) : (
              !docs.length && <p className="text-[15px] text-stone-600">Aucun document.</p>
            )}
          </Card>

          {lease.status === "ACTIVE" && can(p, "lease.write") && (
            <Card title="Fin de location">
              <ActionForm action={endLeaseAction.bind(null, lease.id)} confirm="Terminer cette location ? Le logement redeviendra vacant." className="space-y-3">
                <Field label="Date de sortie" name="endDate" type="date" defaultValue={today} required />
                <SubmitButton className="btn-danger w-full">Terminer la location</SubmitButton>
              </ActionForm>
            </Card>
          )}

          <Card title="🕘 Journal">
            {history.length ? (
              <ul className="space-y-3">
                {history.map((h, i) => (
                  <li key={i} className="text-[14px]">
                    <p className="text-stone-500">
                      {h.createdAt.toLocaleString("fr-FR", { timeZone: "Africa/Lome", dateStyle: "short", timeStyle: "short" })}
                      {h.userName ? ` — ${h.userName}` : ""}
                    </p>
                    <p>{h.summary}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-stone-600">Aucune action enregistrée.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
