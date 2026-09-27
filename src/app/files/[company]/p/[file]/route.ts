import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { readStoredFile } from "@/lib/storage";

/** Fichiers privés (justificatifs de dépenses) : réservés aux membres de l'entreprise qui voient les dépenses. */
export async function GET(_: Request, { params }: { params: Promise<{ company: string; file: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new NextResponse("Non authentifié", { status: 401 });
  const { company, file } = await params;
  if (company !== ctx.companyId || !can(ctx.permissions, "expenses.view")) return new NextResponse("Introuvable", { status: 404 });
  const f = await readStoredFile(`/files/${company}/p/${file}`);
  if (!f) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "sandbox",
    },
  });
}
