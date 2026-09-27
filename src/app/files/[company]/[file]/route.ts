import { NextResponse } from "next/server";
import { readStoredFile } from "@/lib/storage";

/** Fichiers envoyés (logos, photos produits). Noms aléatoires de 128 bits, non devinables. */
export async function GET(_: Request, { params }: { params: Promise<{ company: string; file: string }> }) {
  const { company, file } = await params;
  const f = await readStoredFile(`/files/${company}/${file}`);
  if (!f) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(new Uint8Array(f.data), {
    headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
