import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, List, ListLink, Money, Notice, PageHeader, UnitBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { UNIT_TYPE_LABELS } from "@/modules/finance/labels";
import { getProperty } from "@/modules/properties/service";
import { createUnitAction } from "../actions";
import { UnitFields } from "../unit-fields";

export const metadata: Metadata = { title: "Bien" };

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nouveau?: string }> }) {
  const ctx = await requireStaff("property.read");
  const { id } = await params;
  const { nouveau } = await searchParams;
  const { property, owner, units } = await found(getProperty(ctx, id));
  const canWrite = can(ctx.permissions, "property.write");
  const occupied = units.filter((u) => u.unit.status === "OCCUPIED").length;
  return (
    <>
      <PageHeader
        title={property.name}
        subtitle={[property.district, property.city, property.address].filter(Boolean).join(" · ")}
        back={{ href: "/biens", label: "Mes biens" }}
        actions={
          canWrite && (
            <Link href={`/biens/${id}/modifier`} className="btn-secondary btn-sm">
              Modifier
            </Link>
          )
        }
      />
      {nouveau && <div className="mb-4"><Notice tone="green" title="✅ Bien enregistré">Ajoutez maintenant ses logements ci-dessous.</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card title={`Logements (${units.length}) · ${occupied} occupé${occupied > 1 ? "s" : ""}`} padded={false}>
            {units.length ? (
              <List>
                {units.map((u) => (
                  <ListLink
                    key={u.unit.id}
                    href={u.lease ? `/locations/${u.lease.id}` : `/logements/${u.unit.id}`}
                    title={`${u.unit.label} · ${UNIT_TYPE_LABELS[u.unit.type]}`}
                    subtitle={u.tenantName ?? (u.unit.status === "RESERVED" ? "Réservé" : "Pas de locataire")}
                    right={
                      <>
                        <UnitBadge status={u.unit.status} />
                        <Money value={u.unit.rentAmount} className="text-[14px] text-stone-700" />
                      </>
                    }
                  />
                ))}
              </List>
            ) : (
              <EmptyState icon="🚪" title="Aucun logement">Ajoutez le premier logement de ce bien.</EmptyState>
            )}
          </Card>
          <Card title="Informations">
            <dl className="divide-y divide-sand-100 text-[15px]">
              <div className="flex justify-between py-2"><dt className="text-stone-600">Propriétaire</dt><dd className="font-semibold">{owner?.fullName}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-stone-600">Nombre de logements</dt><dd className="font-semibold">{units.length}</dd></div>
              {property.description && <div className="py-2 text-stone-700">{property.description}</div>}
            </dl>
          </Card>
        </div>
        {canWrite && (
          <div className="lg:col-span-2">
            <Card title="➕ Ajouter un logement">
              <ActionForm action={createUnitAction} resetOnSuccess className="space-y-4">
                <input type="hidden" name="propertyId" value={property.id} />
                <UnitFields />
                <SubmitButton>Ajouter le logement</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
