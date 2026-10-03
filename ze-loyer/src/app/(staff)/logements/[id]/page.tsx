import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, List, ListLink, Money, PageHeader, Row, UnitBadge } from "@/components/ui";
import { db } from "@/db";
import { leases, tenants } from "@/db/schema";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { getScopedUnit } from "@/modules/access";
import { shortDate } from "@/modules/finance/dates";
import { PERIODICITY_LABELS, UNIT_TYPE_LABELS } from "@/modules/finance/labels";
import { toggleReservedAction, updateUnitAction } from "../../biens/actions";
import { UnitFields } from "../../biens/unit-fields";

export const metadata: Metadata = { title: "Logement" };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("property.read");
  const { id } = await params;
  const { unit, property } = await found(getScopedUnit(ctx, id));
  const history = await db
    .select({ lease: leases, tenantName: tenants.fullName })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.unitId, unit.id)))
    .orderBy(desc(leases.startDate));
  const active = history.find((h) => h.lease.status === "ACTIVE");
  const canWrite = can(ctx.permissions, "property.write");
  return (
    <>
      <PageHeader title={`Logement ${unit.label}`} subtitle={`${UNIT_TYPE_LABELS[unit.type]} · ${property.name}`} back={{ href: `/biens/${property.id}`, label: property.name }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Situation" action={<UnitBadge status={unit.status} />}>
            <dl className="divide-y divide-sand-100">
              <Row label="Loyer">
                <Money value={unit.rentAmount} /> · {PERIODICITY_LABELS[unit.periodicity].toLowerCase()}
              </Row>
              <Row label="Échéance">le {unit.dueDay} de chaque période</Row>
              <Row label="Caution demandée">
                <Money value={unit.depositAmount} />
              </Row>
              {active && <Row label="Locataire">{active.tenantName}</Row>}
            </dl>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {active ? (
                <Link href={`/locations/${active.lease.id}`} className="btn-primary">
                  Voir la location
                </Link>
              ) : (
                can(ctx.permissions, "tenant.write") && (
                  <Link href={`/locataires/nouveau?logement=${unit.id}`} className="btn-primary">
                    Mettre un locataire
                  </Link>
                )
              )}
              {!active && canWrite && (
                <form action={toggleReservedAction.bind(null, unit.id, unit.status !== "RESERVED")}>
                  <button className="btn-secondary w-full">{unit.status === "RESERVED" ? "Marquer vacant" : "🟠 Marquer réservé"}</button>
                </form>
              )}
            </div>
          </Card>
          <Card title="Historique des locations" padded={false}>
            {history.length ? (
              <List>
                {history.map((h) => (
                  <ListLink
                    key={h.lease.id}
                    href={`/locations/${h.lease.id}`}
                    title={h.tenantName}
                    subtitle={`Depuis le ${shortDate(h.lease.startDate)}${h.lease.endDate ? ` jusqu'au ${shortDate(h.lease.endDate)}` : ""}`}
                    right={<span className="text-[13px] text-stone-600">{h.lease.status === "ACTIVE" ? "En cours" : "Terminée"}</span>}
                  />
                ))}
              </List>
            ) : (
              <p className="p-4 text-[15px] text-stone-600">Aucune location pour ce logement.</p>
            )}
          </Card>
        </div>
        {canWrite && (
          <Card title="Modifier le logement">
            <ActionForm action={updateUnitAction.bind(null, unit.id)} className="space-y-4">
              <UnitFields d={unit} />
              <p className="text-[13px] text-stone-500">Le loyer d&apos;une location en cours ne change pas : il est fixé à l&apos;entrée du locataire.</p>
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
