import { NextResponse, type NextRequest } from "next/server";
import { isDesktop } from "@/lib/license";
import { refreshOrder } from "@/modules/billing/license-orders";
import { refreshSubscriptionOrder, SUB_REF } from "@/modules/billing/subscription-orders";

export const dynamic = "force-dynamic";

/**
 * Notification de PayGate Global après un paiement de licence (ZL…) ou d'abonnement (ZA…) (URL à renseigner dans le tableau de bord PayGate).
 * Le contenu n'est pas signé : on n'en garde que la référence de commande et on redemande le statut à PayGate.
 */
export async function POST(req: NextRequest) {
  if (isDesktop()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { identifier?: unknown } | null;
  const ref = typeof body?.identifier === "string" ? body.identifier : "";
  if (/^ZL[0-9A-Z]{8}$/.test(ref)) await refreshOrder(ref, { force: true }).catch(() => undefined);
  else if (SUB_REF.test(ref)) await refreshSubscriptionOrder(ref, { force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
