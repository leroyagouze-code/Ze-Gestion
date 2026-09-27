import { NextResponse } from "next/server";
import { getPublicInvoice } from "@/modules/invoices/service";
import { invoicePdf } from "@/pdf/documents";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicInvoice(token);
  if (!data) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const pdf = await invoicePdf(data.company, data.invoice, data.items);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.invoice.number}.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
