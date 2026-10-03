import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Badge, Card, EmptyState, FilterChips, List, ListLink, Money, PageHeader, SituationBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { listTenantsWithSituation } from "@/modules/tenants/service";

export const metadata: Metadata = { title: "Locataires" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const ctx = await requireStaff("tenant.read");
  const sp = await searchParams;
  const status = ["A_JOUR", "EN_RETARD", "EN_AVANCE", "SANS_LOGEMENT"].includes(sp.statut ?? "") ? sp.statut : undefined;
  const rows = await listTenantsWithSituation(ctx, { q: sp.q?.trim() || undefined, status });
  const href = (s?: string) => `/locataires?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(s ? { statut: s } : {}) })}`;
  return (
    <>
      <PageHeader
        title="Mes locataires"
        subtitle={`${rows.length} locataire${rows.length > 1 ? "s" : ""}`}
        actions={
          can(ctx.permissions, "tenant.write") && (
            <Link href="/locataires/nouveau" className="btn-primary">
              <Plus className="h-5 w-5" aria-hidden /> Ajouter un locataire
            </Link>
          )
        }
      />
      <form className="mb-3 flex gap-2" role="search">
        {status && <input type="hidden" name="statut" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Nom, téléphone ou logement…" className="input" aria-label="Rechercher un locataire" />
        <button className="btn-secondary">Chercher</button>
      </form>
      <FilterChips
        current={status}
        items={[
          { label: "Tous", value: undefined, href: href() },
          { label: "🔴 En retard", value: "EN_RETARD", href: href("EN_RETARD") },
          { label: "🟢 À jour", value: "A_JOUR", href: href("A_JOUR") },
          { label: "🔵 En avance", value: "EN_AVANCE", href: href("EN_AVANCE") },
          { label: "Sans logement", value: "SANS_LOGEMENT", href: href("SANS_LOGEMENT") },
        ]}
      />
      <Card padded={false}>
        {rows.length ? (
          <List>
            {rows.map((r) => (
              <ListLink
                key={r.tenant.id}
                href={r.lease ? `/locations/${r.lease.id}` : `/locataires/${r.tenant.id}`}
                title={r.tenant.fullName}
                subtitle={r.lease ? `${r.unitLabel} · ${r.propertyName}` : "Pas de logement en cours"}
                right={
                  r.situation ? (
                    <>
                      <SituationBadge status={r.situation.status} />
                      {r.situation.status === "EN_RETARD" && <Money value={r.situation.overdueAmount} className="text-[14px] font-bold text-red-800" />}
                      {r.situation.status === "EN_AVANCE" && <Money value={r.situation.advance} className="text-[14px] font-bold text-sky-800" />}
                    </>
                  ) : (
                    <Badge>—</Badge>
                  )
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState icon="👥" title={sp.q || status ? "Aucun locataire trouvé" : "Aucun locataire pour le moment"} />
        )}
      </Card>
    </>
  );
}
