import { NextResponse } from "next/server";
import { getSession, getStaff } from "@/lib/auth/server";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/pages";
import { can } from "@/lib/permissions";
import { getReceipt } from "@/modules/finance/service";
import { receiptPdf } from "@/pdf/receipt";

/** Quittance PDF : accès vérifié côté serveur (personnel du périmètre ou locataire titulaire). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    let receipt;
    if (session.organizationId) {
      const ctx = await getStaff();
      if (!ctx || !can(ctx.permissions, "payment.read")) return NextResponse.json({ error: "Interdit" }, { status: 403 });
      receipt = await getReceipt({ kind: "staff", ctx }, id);
    } else {
      receipt = await getReceipt({ kind: "tenant", userId: session.userId }, id);
    }
    const pdf = await receiptPdf(receipt);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quittance-${receipt.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    throw e;
  }
}
