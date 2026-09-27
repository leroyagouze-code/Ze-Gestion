import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, List, ListLink, Notice, PageHeader, TextArea } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { found } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { shortDate, todayISO } from "@/modules/finance/dates";
import { listUnits } from "@/modules/properties/service";
import { getTenantDetail } from "@/modules/tenants/service";
import { createLeaseAction, inviteTenantAction, updateTenantAction } from "../actions";
import { InvitePanel } from "../invite-panel";
import { LeaseFields } from "../lease-fields";

export const metadata: Metadata = { title: "Locataire" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("tenant.read");
  const { id } = await params;
  const { tenant, leases } = await found(getTenantDetail(ctx, id));
  const active = leases.find((l) => l.lease.status === "ACTIVE");
  const canWrite = can(ctx.permissions, "tenant.write");
  const free = !active && can(ctx.permissions, "lease.write") ? (await listUnits(ctx)).filter((u) => u.unit.status !== "OCCUPIED") : [];
  return (
    <>
      <PageHeader title={tenant.fullName} subtitle={formatPhone(tenant.phone)} back={{ href: "/locataires", label: "Mes locataires" }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Espace ZE LOYER">
            {tenant.userId ? (
              <Notice tone="green">✅ {tenant.fullName.split(" ")[0]} a son espace et suit sa situation en temps réel.</Notice>
            ) : can(ctx.permissions, "invite.send") ? (
              <div className="space-y-3">
                <p className="text-[15px] text-stone-700">Invitez le locataire : il pourra voir son carnet, ses quittances et signaler un problème.</p>
                <InvitePanel action={inviteTenantAction.bind(null, tenant.id)} />
              </div>
            ) : (
              <p className="text-[15px] text-stone-600">Le locataire n&apos;a pas encore d&apos;espace.</p>
            )}
          </Card>
          <Card title="Locations" padded={false}>
            {leases.length ? (
              <List>
                {leases.map((l) => (
                  <ListLink
                    key={l.lease.id}
                    href={`/locations/${l.lease.id}`}
                    title={`${l.unit.label} · ${l.property.name}`}
                    subtitle={`Depuis le ${shortDate(l.lease.startDate)}${l.lease.endDate ? ` → ${shortDate(l.lease.endDate)}` : ""}`}
                    right={<Badge tone={l.lease.status === "ACTIVE" ? "green" : "gray"}>{l.lease.status === "ACTIVE" ? "En cours" : "Terminée"}</Badge>}
                  />
                ))}
              </List>
            ) : (
              <p className="p-4 text-[15px] text-stone-600">Aucune location.</p>
            )}
          </Card>
          {!active && free.length > 0 && (
            <Card title="Installer dans un logement">
              <ActionForm action={createLeaseAction.bind(null, tenant.id)} className="space-y-4">
                <LeaseFields
                  units={free.map((u) => ({ id: u.unit.id, label: u.unit.label, propertyName: u.propertyName, rentAmount: u.unit.rentAmount, depositAmount: u.unit.depositAmount, status: u.unit.status }))}
                  today={todayISO()}
                />
                <SubmitButton>Créer la location</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
        {canWrite && (
          <Card title="Fiche du locataire">
            <ActionForm action={updateTenantAction.bind(null, tenant.id)} className="space-y-4">
              <Field label="Nom complet" name="fullName" defaultValue={tenant.fullName} required />
              <Field label="Téléphone" name="phone" type="tel" defaultValue={tenant.phone} required />
              <Field label="Email" name="email" type="email" defaultValue={tenant.email ?? ""} />
              <Field label="N° de pièce d'identité" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
              <TextArea label="Notes" name="notes" defaultValue={tenant.notes ?? ""} />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
