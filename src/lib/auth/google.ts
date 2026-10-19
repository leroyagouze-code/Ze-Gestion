import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Connexion et inscription avec un compte Google (OAuth 2.0 / OpenID Connect, flux « code »).
 *
 * Actif seulement si GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont renseignés (console Google Cloud),
 * et jamais dans l'édition Windows hors ligne. Le jeton d'identité est reçu directement de Google
 * (serveur à serveur, avec notre secret) : ses champs sont contrôlés sans revérifier la signature.
 */

const env = (k: string) => process.env[k]?.trim() || undefined;

export function googleEnabled() {
  return !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET") && process.env.ZE_EDITION !== "desktop";
}

export const GOOGLE_STATE_COOKIE = "g_oauth";
export const GOOGLE_PENDING_COOKIE = "g_pending";
export const GOOGLE_PENDING_TTL_MS = 30 * 60_000;

export type GoogleProfile = { sub: string; email: string; name: string };

export function googleRedirectUri(origin: string) {
  return `${env("APP_URL") ?? origin}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID")!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Contrôle le contenu du jeton d'identité : émetteur, destinataire, expiration et email vérifié par Google. */
export function profileFromIdToken(idToken: string, clientId: string, now = Date.now()): GoogleProfile {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Jeton Google invalide");
  const c = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("Émetteur Google invalide");
  if (c.aud !== clientId) throw new Error("Jeton destiné à une autre application");
  if (typeof c.exp !== "number" || c.exp * 1000 < now) throw new Error("Jeton Google expiré");
  if (c.email_verified !== true && c.email_verified !== "true") throw new Error("Adresse Google non vérifiée");
  const email = String(c.email ?? "").trim().toLowerCase();
  if (!email.includes("@") || typeof c.sub !== "string") throw new Error("Profil Google incomplet");
  const name = String(c.name ?? "").trim() || email.split("@")[0];
  return { sub: c.sub, email, name: name.slice(0, 120) };
}

/** Échange le code reçu au retour de Google contre le profil de l'utilisateur. */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
  const clientId = env("GOOGLE_CLIENT_ID")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google a refusé la connexion (${res.status})`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Réponse Google sans jeton d'identité");
  return profileFromIdToken(data.id_token, clientId);
}

/* Profil Google en attente d'inscription : gardé dans un cookie signé (le nom de l'entreprise reste à saisir). */

const key = () => env("GOOGLE_CLIENT_SECRET") ?? "";
const mac = (body: string) => createHmac("sha256", `ze-google-pending:${key()}`).update(body).digest("base64url");

export function signPendingProfile(p: GoogleProfile, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...p, exp: now + GOOGLE_PENDING_TTL_MS })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readPendingProfile(value: string | undefined, now = Date.now()): GoogleProfile | null {
  if (!value || !key()) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleProfile & { exp: number };
    if (typeof p.exp !== "number" || p.exp < now) return null;
    return { sub: p.sub, email: p.email, name: p.name };
  } catch {
    return null;
  }
}
