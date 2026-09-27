import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, SelectField } from "@/components/ui";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/server";
import { formatPhone } from "@/lib/phone";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { InviteResult } from "./invite-result";

export const metadata: Metadata = { title: "Mon équipe" };

const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Tout, y compris l'équipe et les paramètres",
  MANAGER: "Biens, locataires, paiements, invitations",
  ACCOUNTANT: "Paiements, annulations, cautions, contestations",
  FIELD_AGENT: "Encaisser les loyers, suivre les demandes",
  OWNER: "Consultation de ses biens uniquement",
};

export default async function TeamPage() {
  const ctx = await requireStaff("members.manage");
  const members = await db
    .select({ m: memberships, name: users.fullName, phone: users.phone })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, ctx.orgId));
  return (
    <>
      <PageHeader title="Mon équipe" back={{ href: "/parametres", label: "Paramètres" }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Membres (${members.length})`} padded={false}>
          <ul className="divide-y divide-sand-100">
            {members.map((x) => (
              <li key={x.m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold">{x.name}</p>
                  <p className="text-[14px] text-stone-600">{formatPhone(x.phone)}</p>
                </div>
                <Badge tone={x.m.role === "ADMIN" ? "green" : "gray"}>{ROLE_LABELS[x.m.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Inviter un membre">
          <InviteResult>
            <Field label="Nom complet" name="fullName" required />
            <Field label="Téléphone" name="phone" type="tel" required />
            <SelectField label="Rôle" name="role" options={(["MANAGER", "ACCOUNTANT", "FIELD_AGENT", "ADMIN"] as Role[]).map((r) => ({ value: r, label: `${ROLE_LABELS[r]} — ${ROLE_HELP[r]}` }))} />
            <SubmitButton>Créer le lien d&apos;invitation</SubmitButton>
          </InviteResult>
        </Card>
      </div>
    </>
  );
}

