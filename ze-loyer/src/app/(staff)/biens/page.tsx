import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Badge, Card, EmptyState, FilterChips, List, ListLink, PageHeader, UnitBadge, Money } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { UNIT_TYPE_LABELS } from "@/modules/finance/labels";
import { listProperties, listUnits } from "@/modules/properties/service";

export const metadata: Metadata = { title: "Biens" };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ vue?: string; proprietaire?: string }> }) {
  const ctx = await requireStaff("property.read");
  const sp = await searchParams;
  const vue = sp.vue === "VACANT" || sp.vue === "RESERVED" || sp.vue === "OCCUPIED" ? sp.vue : undefined;
  const [props, unitRows] = await Promise.all([listProperties(ctx, { ownerId: sp.proprietaire }), vue ? listUnits(ctx, { status: vue }) : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title="Mes biens"
        subtitle={`${props.length} bien${props.length > 1 ? "s" : ""} · ${props.reduce((s, p) => s + p.unitCount, 0)} logements`}
        actions={
          can(ctx.permissions, "property.write") && (
            <Link href="/biens/nouveau" className="btn-primary">
              <Plus className="h-5 w-5" aria-hidden /> Ajouter un bien
            </Link>
          )
        }
      />
      <FilterChips
        current={vue}
        items={[
          { label: "Tous les biens", value: undefined, href: "/biens" },
          { label: "🟢 Occupés", value: "OCCUPIED", href: "/biens?vue=OCCUPIED" },
          { label: "🔴 Vacants", value: "VACANT", href: "/biens?vue=VACANT" },
          { label: "🟠 Réservés", value: "RESERVED", href: "/biens?vue=RESERVED" },
        ]}
      />
      {vue ? (
        <Card padded={false}>
          {unitRows.length ? (
            <List>
              {unitRows.map((u) => (
                <ListLink
                  key={u.unit.id}
                  href={`/logements/${u.unit.id}`}
                  title={`${u.unit.label} · ${UNIT_TYPE_LABELS[u.unit.type]}`}
                  subtitle={`${u.propertyName}${u.district ? ` · ${u.district}` : ""}`}
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
            <EmptyState title="Aucun logement dans cette catégorie" />
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {props.length ? (
            <List>
              {props.map((p) => (
                <ListLink
                  key={p.property.id}
                  href={`/biens/${p.property.id}`}
                  title={p.property.name}
                  subtitle={[p.property.district, p.property.city, ctx.orgKind === "AGENCY" ? p.ownerName : null].filter(Boolean).join(" · ")}
                  right={
                    <>
                      <span className="text-[14px] font-semibold">
                        {p.unitCount} logement{p.unitCount > 1 ? "s" : ""}
                      </span>
                      <Badge tone={p.occupiedCount === p.unitCount && p.unitCount > 0 ? "green" : "orange"}>
                        {p.occupiedCount}/{p.unitCount} occupés
                      </Badge>
                    </>
                  }
                />
              ))}
            </List>
          ) : (
            <EmptyState icon="🏢" title="Aucun bien pour le moment" action={can(ctx.permissions, "property.write") && <Link href="/biens/nouveau" className="btn-primary">Ajouter un bien</Link>}>
              Un bien peut être un immeuble, une maison, une cour avec plusieurs chambres…
            </EmptyState>
          )}
        </Card>
      )}
    </>
  );
}
