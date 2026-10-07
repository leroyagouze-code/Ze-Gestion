import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, FilterChips, Money, PageHeader, TextArea } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { shortDate } from "@/modules/finance/dates";
import { listDisputes } from "@/modules/disputes/service";
import { resolveDisputeAction } from "../suivi-actions";

export const metadata: Metadata = { title: "Contestations" };

const LABEL = { OPEN: "À traiter", RESOLVED: "Acceptée", REJECTED: "Refusée" } as const;

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const ctx = await requireStaff("dispute.read");
  const { statut } = await searchParams;
  const status = statut === "RESOLVED" || statut === "REJECTED" ? statut : statut === "TOUT" ? undefined : "OPEN";
  const rows = await listDisputes(ctx, status);
  const canResolve = can(ctx.permissions, "dispute.resolve");
  return (
    <>
      <PageHeader title="Contestations" subtitle="Erreurs signalées par les locataires. L'historique n'est jamais modifié sans trace." />
      <FilterChips
        current={statut ?? "OPEN"}
        items={[
          { label: "À traiter", value: "OPEN", href: "/contestations" },
          { label: "Acceptées", value: "RESOLVED", href: "/contestations?statut=RESOLVED" },
          { label: "Refusées", value: "REJECTED", href: "/contestations?statut=REJECTED" },
          { label: "Toutes", value: "TOUT", href: "/contestations?statut=TOUT" },
        ]}
      />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.dispute.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-bold">{r.tenantName}</p>
                  <p className="text-[14px] text-stone-600">
                    {r.unitLabel} · {r.propertyName} · le {shortDate(r.dispute.createdAt.toISOString().slice(0, 10))}
                  </p>
                </div>
                <Badge tone={r.dispute.status === "OPEN" ? "orange" : r.dispute.status === "RESOLVED" ? "green" : "gray"}>{LABEL[r.dispute.status]}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-[15px]">
                {r.paymentAmount != null && (
                  <p>
                    Paiement concerné : <Money value={r.paymentAmount} className="font-semibold" /> du {shortDate(r.paymentDate!)}
                  </p>
                )}
                {r.dispute.amount != null && (
                  <p>
                    Montant indiqué : <Money value={r.dispute.amount} className="font-semibold" />
                    {r.dispute.date ? ` · payé le ${shortDate(r.dispute.date)}` : ""}
                  </p>
                )}
                <p className="rounded-xl bg-sand-100 p-3">« {r.dispute.comment} »</p>
                {r.dispute.proofDocumentId && (
                  <a href={`/api/documents/${r.dispute.proofDocumentId}`} target="_blank" className="font-semibold text-brand-700 underline">
                    🧾 Voir la preuve jointe
                  </a>
                )}
                {r.dispute.response && (
                  <p className="text-stone-700">
                    <strong>Réponse{r.resolvedByName ? ` de ${r.resolvedByName}` : ""} :</strong> {r.dispute.response}
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/locataires/${r.tenantId}`} className="btn-secondary btn-sm">
                  Voir le locataire
                </Link>
              </div>
              {r.dispute.status === "OPEN" && canResolve && (
                <ActionForm action={resolveDisputeAction} className="mt-4 space-y-3 border-t border-sand-100 pt-4">
                  <input type="hidden" name="disputeId" value={r.dispute.id} />
                  <TextArea label="Votre réponse au locataire" name="response" required placeholder="Ex. Vous avez raison, le paiement du 05/09 a été ajouté." />
                  <p className="text-[13px] text-stone-500">Si une correction est nécessaire, enregistrez le paiement manquant ou annulez le paiement erroné depuis la location : tout reste tracé.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <SubmitButton name="decision" value="RESOLVED" className="btn-primary">
                      ✅ Accepter
                    </SubmitButton>
                    <SubmitButton name="decision" value="REJECTED" className="btn-secondary">
                      Refuser
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="✅" title="Aucune contestation" />
        </div>
      )}
    </>
  );
}
