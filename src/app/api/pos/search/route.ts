import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { searchForPos } from "@/modules/products/service";

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(ctx.permissions, "sales.create")) return NextResponse.json({ error: "Interdit" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const rows = await searchForPos(ctx, q, 30);
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
