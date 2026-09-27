import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyText } from "@/components/copy-text";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isDesktop } from "@/lib/license";
import { NotFoundError } from "@/lib/errors";
import { LICENSE_DURATIONS } from "@/modules/billing/license";
import { publicOrder } from "@/modules/billing/license-orders";
import { NETWORKS } from "@/modules/billing/paygate";
import { simulateAction } from "../actions";
import { OrderPoller } from "./poller";

export const metadata = { title: "Suivi de l'achat" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (isDesktop() || !/^ZL[0-9A-Z]{8}$/.test(ref)) notFound();
  const o = await publicOrder(ref).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const what = `${o.plan}, ${LICENSE_DURATIONS[o.duration]}`;
  const until = o.expiresAt ? `valable jusqu'au ${formatDate(o.expiresAt)}` : "à vie";
  return (
    <div className="card space-y-5 p-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Commande {o.reference}</div>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Licence {what}</h1>
        <p className="text-sm text-slate-500">
          Ordinateur <span className="font-mono">{o.installId}</span> · {formatMoney(o.amount, o.currency)}
          {o.network ? ` · ${NETWORKS[o.network]} ${o.phone}` : ""}
        </p>
      </div>

      {o.status === "pending" && o.provider === "simulation" && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <b>Mode test.</b> Sur le vrai service, le client reçoit ici une demande de confirmation sur son téléphone. Choisissez le résultat du paiement :
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={simulateAction.bind(null, o.reference, "paid")}>
              <button className="btn-primary">Paiement réussi</button>
            </form>
            <form action={simulateAction.bind(null, o.reference, "failed")}>
              <button className="btn-secondary">Paiement refusé</button>
            </form>
          </div>
        </div>
      )}

      {o.status === "pending" && o.provider !== "simulation" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-medium">Confirmez le paiement sur votre téléphone.</p>
          <p className="mt-1">
            Une demande {o.network ? NETWORKS[o.network] : ""} de {formatMoney(o.amount, o.currency)} a été envoyée au {o.phone}. Tapez votre code secret pour valider.
            Cette page se met à jour toute seule.
          </p>
        </div>
      )}
      {o.status === "pending" && <OrderPoller reference={o.reference} />}

      {o.status === "paid" && o.code && (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <b>Paiement confirmé, merci !</b> Votre licence {what} est {until}.
          </p>
          <p className="text-sm text-emerald-900">
            Le logiciel s&apos;active tout seul : ouvrez le menu <b>Licence</b> et cliquez sur <b>Récupérer ma licence</b>. Si l&apos;ordinateur n&apos;a pas internet, collez ce code :
          </p>
          <CopyText value={o.code} whatsappText={`Ma licence ZE Gestion (${what}, ${until}) :\n${o.code}`} />
        </div>
      )}

      {(o.status === "failed" || o.status === "cancelled") && (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            <b>Le paiement n&apos;a pas abouti.</b> {o.failureReason ?? ""} Aucun montant n&apos;a été prélevé pour cette commande.
          </p>
          <Link href={`/acheter-licence?code=${o.installId}`} className="btn-secondary">Réessayer</Link>
        </div>
      )}
    </div>
  );
}
