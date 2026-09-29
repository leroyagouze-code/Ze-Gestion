import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/server";
import { setRequestTimeZone } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getCashSession } from "@/modules/registers/service";
import { zReportPdf } from "@/pdf/z-report";

/** Rapport Z d'une session de caisse clôturée (le caissier ne voit que les siennes). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(ctx.permissions, "sales.view")) return NextResponse.json({ error: "Interdit" }, { status: 403 });
  setRequestTimeZone(ctx.company.timezone);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const s = await getCashSession(ctx, id);
    if (s.status !== "closed") return NextResponse.json({ error: "Session encore ouverte" }, { status: 409 });
    const pdf = await zReportPdf(ctx.company, s);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="rapport-z-${s.registerName.replace(/[^\w-]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    throw e;
  }
}
