import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, FilterChips, PageHeader, SelectField, TextArea } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { shortDate } from "@/modules/finance/dates";
import { listRequests } from "@/modules/requests/service";
import { updateRequestAction } from "../suivi-actions";

export const metadata: Metadata = { title: "Demandes" };

const LABEL = { OPEN: "Nouvelle", IN_PROGRESS: "En cours", CLOSED: "Terminée" } as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const ctx = await requireStaff("tenant.read");
  const { statut } = await searchParams;
  const status = statut === "IN_PROGRESS" || statut === "CLOSED" || statut === "OPEN" ? statut : undefined;
  const rows = await listRequests(ctx, status);
  const canManage = can(ctx.permissions, "request.manage");
  return (
    <>
      <PageHeader title="Demandes des locataires" subtitle="Problèmes signalés (fuite, panne, travaux…)" />
      <FilterChips
        current={status}
        items={[
          { label: "Toutes", value: undefined, href: "/demandes" },
          { label: "Nouvelles", value: "OPEN", href: "/demandes?statut=OPEN" },
          { label: "En cours", value: "IN_PROGRESS", href: "/demandes?statut=IN_PROGRESS" },
          { label: "Terminées", value: "CLOSED", href: "/demandes?statut=CLOSED" },
        ]}
      />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.request.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-bold">{r.request.subject}</p>
                  <p className="text-[14px] text-stone-600">
                    {r.tenantName} · {r.unitLabel} · {r.propertyName} · {shortDate(r.request.createdAt.toISOString().slice(0, 10))}
                  </p>
                </div>
                <Badge tone={r.request.status === "OPEN" ? "orange" : r.request.status === "IN_PROGRESS" ? "blue" : "green"}>{LABEL[r.request.status]}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-line text-[15px]">{r.request.message}</p>
              {r.request.response && <p className="mt-2 text-[15px] text-stone-700"><strong>Réponse :</strong> {r.request.response}</p>}
              {canManage && r.request.status !== "CLOSED" && (
                <ActionForm action={updateRequestAction} className="mt-4 grid gap-3 border-t border-sand-100 pt-4 sm:grid-cols-3">
                  <input type="hidden" name="requestId" value={r.request.id} />
                  <SelectField label="Statut" name="status" options={[{ value: "IN_PROGRESS", label: "En cours" }, { value: "CLOSED", label: "Terminée" }, { value: "OPEN", label: "Nouvelle" }]} defaultValue={r.request.status === "OPEN" ? "IN_PROGRESS" : "CLOSED"} />
                  <TextArea label="Réponse (facultatif)" name="response" className="sm:col-span-2" rows={2} />
                  <SubmitButton className="btn-primary sm:col-span-3">Mettre à jour</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="🔧" title="Aucune demande" />
        </div>
      )}
    </>
  );
}
