import { NextResponse } from "next/server";
import { isDesktop } from "@/lib/license";
import { latestLicenseFor } from "@/modules/billing/license-orders";

export const dynamic = "force-dynamic";

/** Dernière licence valable d'un poste : le logiciel l'interroge pour s'activer tout seul après l'achat. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDesktop()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const l = await latestLicenseFor(id).catch(() => null);
  if (!l) return NextResponse.json({ license: null }, { status: 404 });
  return NextResponse.json({ license: { code: l.code, plan: l.plan, expiresAt: l.expiresAt } });
}
