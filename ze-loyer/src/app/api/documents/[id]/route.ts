import { NextResponse } from "next/server";
import { getSession, getStaff } from "@/lib/auth/server";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/pages";
import { readStoredFile } from "@/lib/storage";
import { getDocumentFor } from "@/modules/documents/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const ctx = session.organizationId ? await getStaff() : null;
    if (session.organizationId && !ctx) return NextResponse.json({ error: "Interdit" }, { status: 403 });
    const doc = await getDocumentFor(ctx ? { kind: "staff", ctx } : { kind: "tenant", userId: session.userId }, id);
    const data = await readStoredFile(doc.storageKey);
    if (!data) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="document.${doc.storageKey.split(".").pop()}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    throw e;
  }
}
