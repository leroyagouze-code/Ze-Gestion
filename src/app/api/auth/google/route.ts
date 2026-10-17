import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, googleAuthUrl, googleEnabled, googleRedirectUri } from "@/lib/auth/google";
import { newToken } from "@/lib/auth/session";

/** Départ vers Google : un état aléatoire en cookie protège le retour contre la falsification (CSRF). */
/** Adresse publique du site (derrière Caddy, l'URL interne de la requête peut différer). */
const base = (req: NextRequest) => process.env.APP_URL?.trim() || req.nextUrl.origin;

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", base(req)));
  const state = newToken(24);
  const res = NextResponse.redirect(googleAuthUrl(state, googleRedirectUri(req.nextUrl.origin)));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
