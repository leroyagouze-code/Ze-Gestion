import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/server";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getInvoice } from "@/modules/invoices/service";
import { invoicePdf } from "@/pdf/documents";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(ctx.permissions, "invoices.view")) return NextResponse.json({ error: "Interdit" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const { invoice, items } = await getInvoice(ctx, id);
    const pdf = await invoicePdf(ctx.company, invoice, items);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    throw e;
  }
}
