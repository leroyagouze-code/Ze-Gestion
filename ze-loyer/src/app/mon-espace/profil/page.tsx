import type { Metadata } from "next";
import { Card, List, ListLink, PageHeader, Row } from "@/components/ui";
import { getSession, requireTenant } from "@/lib/auth/server";
import { formatPhone } from "@/lib/phone";
import { listSpaces } from "@/modules/auth/context";
import { logoutAction } from "../../(public)/actions";

export const metadata: Metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  const ctx = await requireTenant();
  const s = (await getSession())!;
  const spaces = await listSpaces(ctx.userId);
  return (
    <div className="space-y-5">
      <PageHeader title="👤 Mon profil" />
      <Card>
        <dl className="divide-y divide-sand-100">
          <Row label="Nom">{ctx.userName}</Row>
          <Row label="Téléphone">{formatPhone(ctx.phone)}</Row>
          {s.email && <Row label="Email">{s.email}</Row>}
        </dl>
      </Card>
      <Card padded={false}>
        <List>
          <ListLink href="/mon-espace/notifications" title="🔔 Mes notifications" />
          {spaces.orgs.length > 0 && <ListLink href="/espaces" title="Changer d'espace" subtitle="Vous êtes aussi propriétaire ou membre d'une agence" />}
        </List>
      </Card>
      <p className="text-[14px] text-stone-600">🔒 Seuls vous et votre agence / propriétaire voyez ces informations.</p>
      <form action={logoutAction}>
        <button className="btn-secondary w-full">Se déconnecter</button>
      </form>
    </div>
  );
}
