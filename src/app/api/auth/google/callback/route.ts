import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_PENDING_COOKIE,
  GOOGLE_PENDING_TTL_MS,
  GOOGLE_STATE_COOKIE,
  exchangeGoogleCode,
  googleEnabled,
  googleRedirectUri,
  signPendingProfile,
} from "@/lib/auth/google";
import { requestMeta } from "@/lib/auth/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { loginWithGoogle } from "@/modules/auth/service";

const secure = process.env.NODE_ENV === "production";

function sameState(a: string | undefined, b: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Retour de Google : compte existant → connexion ; adresse inconnue → profil gardé (cookie signé, 30 min)
 * et formulaire d'inscription pré-rempli, où il ne reste qu'à nommer l'entreprise.
 */
/** Adresse publique du site (derrière Caddy, l'URL interne de la requête peut différer). */
const base = (req: NextRequest) => process.env.APP_URL?.trim() || req.nextUrl.origin;

export async function GET(req: NextRequest) {
  const fail = (code = "google") => {
    const r = NextResponse.redirect(new URL(`/login?error=${code}`, base(req)));
    r.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    return r;
  };
  if (!googleEnabled()) return fail();
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail("google_cancelled");
  if (!sameState(req.cookies.get(GOOGLE_STATE_COOKIE)?.value, q.get("state")) || !q.get("code")) return fail();

  let profile;
  try {
    profile = await exchangeGoogleCode(q.get("code")!, googleRedirectUri(req.nextUrl.origin));
  } catch (e) {
    console.error("[google] connexion refusée", e);
    return fail();
  }

  const done = await loginWithGoogle(profile, await requestMeta());
  if (!done) {
    const r = NextResponse.redirect(new URL("/signup?google=1", base(req)));
    r.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    r.cookies.set(GOOGLE_PENDING_COOKIE, signPendingProfile(profile), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_PENDING_TTL_MS / 1000,
    });
    return r;
  }
  const target = done.companyId ? "/" : done.isSuperAdmin ? "/admin" : "/login?error=no_company";
  const r = NextResponse.redirect(new URL(target, base(req)));
  r.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  r.cookies.set(SESSION_COOKIE, done.session.token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: done.session.expiresAt });
  return r;
}
