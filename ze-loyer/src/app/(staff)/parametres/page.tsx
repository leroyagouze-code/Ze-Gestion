import type { Metadata } from "next";
import { Badge, Card, List, ListLink, PageHeader, Row } from "@/components/ui";
import { LOCALES } from "@/i18n";
import { getSession, requireStaff } from "@/lib/auth/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { listSpaces } from "@/modules/auth/context";
import { PLANS } from "@/modules/plans";
import { logoutAction } from "../../(public)/actions";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const ctx = await requireStaff();
  const s = (await getSession())!;
  const spaces = await listSpaces(ctx.userId);
  const p = ctx.permissions;
  const plan = PLANS.find((x) => x.code === ctx.plan);
  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Mon compte">
          <dl className="divide-y divide-sand-100">
            <Row label="Nom">{ctx.userName}</Row>
            <Row label="Téléphone">{formatPhone(s.phone)}</Row>
            {s.email && <Row label="Email">{s.email}</Row>}
            <Row label="Rôle">{ROLE_LABELS[ctx.role]}</Row>
          </dl>
        </Card>
        <Card title={ctx.orgKind === "AGENCY" ? "Mon agence" : "Mon espace propriétaire"}>
          <dl className="divide-y divide-sand-100">
            <Row label="Nom">{ctx.orgName}</Row>
            <Row label="Formule">
              <Badge tone="blue">{plan?.label ?? ctx.plan}</Badge>
            </Row>
          </dl>
          <p className="mt-2 text-[13px] text-stone-500">Les formules payantes seront proposées plus tard. Aucun paiement d&apos;abonnement n&apos;est demandé aujourd&apos;hui.</p>
        </Card>

        <Card title="Suivi" padded={false}>
          <List>
            <ListLink href="/impayes" title="🔴 Impayés" />
            <ListLink href="/contestations" title="⚠️ Contestations" subtitle="Erreurs signalées par les locataires" />
            <ListLink href="/demandes" title="🔧 Demandes" subtitle="Problèmes signalés par les locataires" />
            <ListLink href="/notifications" title="🔔 Notifications" />
            {ctx.orgKind === "AGENCY" && can(p, "owner.manage") && <ListLink href="/proprietaires" title="👤 Propriétaires" />}
            {can(p, "members.manage") && <ListLink href="/parametres/equipe" title="👥 Mon équipe" subtitle="Gestionnaires, comptables, agents terrain" />}
            {can(p, "audit.read") && <ListLink href="/journal" title="🕘 Journal des actions" />}
          </List>
        </Card>

        <Card title="Langue">
          <ul className="space-y-2">
            {LOCALES.map((l) => (
              <li key={l.code} className="flex items-center justify-between text-[15px]">
                <span>{l.label}</span>
                {l.ready ? <Badge tone="green">Active</Badge> : <Badge>Bientôt</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        {(spaces.orgs.length > 1 || spaces.isTenant) && (
          <Card title="Changer d'espace" padded={false}>
            <List>
              <ListLink href="/espaces" title="Voir mes espaces" subtitle="Agence, propriétaire ou locataire" />
            </List>
          </Card>
        )}

        <form action={logoutAction} className="lg:col-span-2">
          <button className="btn-secondary w-full">Se déconnecter</button>
        </form>
      </div>
    </>
  );
}
