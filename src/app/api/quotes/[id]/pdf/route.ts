import { showAppCredit } from "@/modules/billing/access";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/server";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getQuote } from "@/modules/quotes/service";
import { quotePdf } from "@/pdf/documents";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(ctx.permissions, "quotes.view")) return NextResponse.json({ error: "Interdit" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const { quote, items } = await getQuote(ctx, id);
    const pdf = await quotePdf(ctx.company, quote, items, { credit: showAppCredit(ctx.subscription) });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${quote.number}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    throw e;
  }
}
