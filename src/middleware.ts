import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/f/", "/api/f/", "/api/health", "/files/", "/forbidden", "/brand/"];

/** Filtre rapide : sans cookie de session, redirection vers /login. La session est vérifiée côté serveur. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("gs_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico|icon.png|apple-icon.png|robots.txt).*)"] };
