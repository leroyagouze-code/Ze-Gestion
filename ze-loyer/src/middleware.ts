import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/connexion", "/inscription", "/invitation/", "/hors-ligne", "/api/health", "/api/cron/", "/manifest.webmanifest", "/sw.js", "/icon", "/apple-icon", "/interdit"];

/** Filtre rapide : sans cookie de session → page de connexion. La session et les droits sont vérifiés côté serveur. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("zl_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico|robots.txt|icons/).*)"] };
