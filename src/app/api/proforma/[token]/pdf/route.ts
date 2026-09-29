import { showAppCredit, subscriptionState } from "@/modules/billing/access";
import { NextResponse } from "next/server";
import { getPublicQuote } from "@/modules/quotes/service";
import { quotePdf } from "@/pdf/documents";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicQuote(token);
  if (!data) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const pdf = await quotePdf(data.company, data.quote, data.items, { credit: showAppCredit(await subscriptionState(data.company.id)) });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.quote.number}.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
