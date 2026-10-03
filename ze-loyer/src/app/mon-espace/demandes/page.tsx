import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Money, Notice, PageHeader, TextArea } from "@/components/ui";
import { requireTenant } from "@/lib/auth/server";
import { getTenantLease } from "@/modules/access";
import { listTenantDisputes } from "@/modules/disputes/service";
import { shortDate } from "@/modules/finance/dates";
import { listTenantRequests } from "@/modules/requests/service";
import { createRequestAction } from "../actions";
import { NoLease } from "../no-lease";

export const metadata: Metadata = { title: "Mes demandes" };

const REQ = { OPEN: ["Envoyée", "orange"], IN_PROGRESS: ["En cours", "blue"], CLOSED: ["Terminée", "green"] } as const;
const DIS = { OPEN: ["En attente", "orange"], RESOLVED: ["Acceptée", "green"], REJECTED: ["Refusée", "gray"] } as const;

export default async function TenantRequestsPage({ searchParams }: { searchParams: Promise<{ signale?: string }> }) {
  const ctx = await requireTenant();
  const { signale } = await searchParams;
  const { current } = await getTenantLease(ctx.userId, undefined);
  if (!current) return <NoLease phone={ctx.phone} />;
  const [reqs, disputes] = await Promise.all([listTenantRequests(current.lease.id), listTenantDisputes(current.lease.id)]);
  return (
    <div className="space-y-5">
      <PageHeader title="🔧 Mes demandes" />
      {signale && <Notice tone="green" title="✅ Signalement envoyé">Votre agence / propriétaire va vérifier. Votre historique n&apos;est pas modifié tant qu&apos;il n&apos;a pas répondu.</Notice>}

      <Card title="Signaler un problème">
        <ActionForm action={createRequestAction} resetOnSuccess className="space-y-4">
          <input type="hidden" name="leaseId" value={current.lease.id} />
          <Field label="Sujet" name="subject" placeholder="Ex. Fuite d'eau dans la douche" required />
          <TextArea label="Expliquez le problème" name="message" required />
          <SubmitButton>Envoyer</SubmitButton>
        </ActionForm>
      </Card>

      <div className="card flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]">Une erreur dans vos paiements ?</p>
        <Link href="/mon-espace/signaler" className="btn-secondary btn-sm">
          ⚠️ Signaler une erreur
        </Link>
      </div>

      {disputes.length > 0 && (
        <Card title="Mes signalements d'erreur" padded={false}>
          <ul className="divide-y divide-sand-100">
            {disputes.map((d) => (
              <li key={d.dispute.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px]">« {d.dispute.comment} »</p>
                  <Badge tone={DIS[d.dispute.status][1]}>{DIS[d.dispute.status][0]}</Badge>
                </div>
                <p className="mt-1 text-[13px] text-stone-500">
                  Envoyé le {shortDate(d.dispute.createdAt.toISOString().slice(0, 10))}
                  {d.dispute.amount != null && (
                    <>
                      {" "}· <Money value={d.dispute.amount} />
                    </>
                  )}
                </p>
                {d.dispute.response && <p className="mt-2 rounded-xl bg-sand-100 p-3 text-[15px]"><strong>Réponse :</strong> {d.dispute.response}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Mes demandes" padded={false}>
        {reqs.length ? (
          <ul className="divide-y divide-sand-100">
            {reqs.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.subject}</p>
                  <Badge tone={REQ[r.status][1]}>{REQ[r.status][0]}</Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-[15px] text-stone-700">{r.message}</p>
                {r.response && <p className="mt-2 rounded-xl bg-sand-100 p-3 text-[15px]"><strong>Réponse :</strong> {r.response}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-[15px] text-stone-600">Aucune demande pour le moment.</p>
        )}
      </Card>
    </div>
  );
}
