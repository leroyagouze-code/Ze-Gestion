import { NextResponse } from "next/server";
import { isDesktop } from "@/lib/license";
import { publicOrder } from "@/modules/billing/license-orders";

export const dynamic = "force-dynamic";

/** Statut d'une commande de licence, lu par la page de suivi toutes les quelques secondes. */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (isDesktop() || !/^ZL[0-9A-Z]{8}$/.test(ref)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const o = await publicOrder(ref).catch(() => null);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: o.status, code: o.code, failureReason: o.failureReason });
}
