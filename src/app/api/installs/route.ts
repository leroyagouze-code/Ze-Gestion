import { NextResponse, type NextRequest } from "next/server";
import { isDesktop } from "@/lib/license";
import { recordInstall } from "@/modules/installs/service";

export const dynamic = "force-dynamic";

/** Reçoit le signal « je suis installé » des logiciels Windows (voir src/modules/installs/report.ts). */
export async function POST(req: NextRequest) {
  if (isDesktop()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 4096) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    const body = await req.json();
    // pays vu par le proxy (Cloudflare) quand il existe, sinon celui déclaré par l'entreprise
    await recordInstall(body, req.headers.get("cf-ipcountry"));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
