import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { getTenantLease } from "@/modules/access";
import { listLeaseDocuments } from "@/modules/documents/service";
import { shortDate } from "@/modules/finance/dates";
import { NoLease } from "../no-lease";

export const metadata: Metadata = { title: "Mes documents" };

export default async function DocumentsPage() {
  const ctx = await requireTenant();
  const { current } = await getTenantLease(ctx.userId, undefined);
  if (!current) return <NoLease phone={ctx.phone} />;
  const docs = await listLeaseDocuments(current.lease.id);
  const contract = docs.filter((d) => d.kind === "CONTRACT");
  const others = docs.filter((d) => d.kind !== "CONTRACT");
  const item = (d: (typeof docs)[number]) => (
    <li key={d.id}>
      <a href={`/api/documents/${d.id}`} target="_blank" className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
        <span className="font-semibold">📄 {d.title}</span>
        <span className="text-[13px] text-stone-500">{shortDate(d.createdAt.toISOString().slice(0, 10))}</span>
      </a>
    </li>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="📄 Mes documents" />
      <Card title="Mon contrat" padded={false}>
        {contract.length ? <ul className="divide-y divide-sand-100">{contract.map(item)}</ul> : <EmptyState title="Contrat pas encore disponible">Votre agence ou propriétaire pourra l&apos;ajouter ici.</EmptyState>}
      </Card>
      {others.length > 0 && (
        <Card title="Autres documents" padded={false}>
          <ul className="divide-y divide-sand-100">{others.map(item)}</ul>
        </Card>
      )}
    </div>
  );
}
