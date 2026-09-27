import { NextResponse, type NextRequest } from "next/server";
import { isDesktop } from "@/lib/license";
import { refreshOrder } from "@/modules/billing/license-orders";

export const dynamic = "force-dynamic";

/**
 * Notification de PayGate Global après un paiement (URL à renseigner dans le tableau de bord PayGate).
 * Le contenu n'est pas signé : on n'en garde que la référence de commande et on redemande le statut à PayGate.
 */
export async function POST(req: NextRequest) {
  if (isDesktop()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { identifier?: unknown } | null;
  const ref = typeof body?.identifier === "string" ? body.identifier : "";
  if (/^ZL[0-9A-Z]{8}$/.test(ref)) await refreshOrder(ref, { force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
