import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { formatPhone } from "@/lib/phone";
import { listOwners } from "@/modules/tenants/service";
import { InvitePanel } from "../locataires/invite-panel";
import { createOwnerAction, inviteOwnerAction } from "./actions";

export const metadata: Metadata = { title: "Propriétaires" };

export default async function OwnersPage() {
  const ctx = await requireStaff("owner.manage");
  const owners = await listOwners(ctx);
  return (
    <>
      <PageHeader title="Propriétaires" subtitle={`${owners.length} propriétaire${owners.length > 1 ? "s" : ""} suivis par ${ctx.orgName}`} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {owners.length ? (
            owners.map((o) => (
              <Card key={o.owner.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-bold">{o.owner.fullName}</p>
                    <p className="text-[14px] text-stone-600">{o.owner.phone ? formatPhone(o.owner.phone) : "Pas de téléphone"}</p>
                  </div>
                  <Link href={`/biens?proprietaire=${o.owner.id}`} className="text-right text-[14px] font-semibold text-brand-700 underline">
                    {o.propertyCount} bien{o.propertyCount > 1 ? "s" : ""} · {o.unitCount} logement{o.unitCount > 1 ? "s" : ""}
                  </Link>
                </div>
                <div className="mt-3">
                  {o.owner.userId ? (
                    <Badge tone="green">A son accès (consultation)</Badge>
                  ) : o.owner.phone ? (
                    <InvitePanel action={inviteOwnerAction.bind(null, o.owner.id)} label="📲 Donner un accès au propriétaire" />
                  ) : null}
                </div>
              </Card>
            ))
          ) : (
            <div className="card">
              <EmptyState icon="👤" title="Aucun propriétaire" />
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          <Card title="➕ Ajouter un propriétaire">
            <ActionForm action={createOwnerAction} resetOnSuccess className="space-y-4">
              <Field label="Nom complet" name="fullName" required />
              <Field label="Téléphone" name="phone" type="tel" placeholder="90 12 34 56" />
              <Field label="Email (facultatif)" name="email" type="email" />
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-[13px] text-stone-500">Un propriétaire invité voit uniquement ses biens, ses loyers et ses rapports.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
