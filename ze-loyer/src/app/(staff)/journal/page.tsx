import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { listAudit } from "@/modules/audit/service";

export const metadata: Metadata = { title: "Journal" };

export default async function AuditPage() {
  const ctx = await requireStaff("audit.read");
  const rows = await listAudit(ctx.orgId, { limit: 200 });
  return (
    <>
      <PageHeader title="Journal des actions" subtitle="Toutes les actions importantes, horodatées. Rien ne peut y être modifié ni effacé." />
      <Card padded={false}>
        {rows.length ? (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="text-[13px] text-stone-500">
                  {r.createdAt.toLocaleString("fr-FR", { timeZone: "Africa/Lome", dateStyle: "short", timeStyle: "short" })} — {r.userName ?? "Système"}
                </p>
                <p className="text-[15px]">{r.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune action enregistrée" />
        )}
      </Card>
    </>
  );
}
