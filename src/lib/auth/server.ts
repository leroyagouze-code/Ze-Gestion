import "server-only";
import { setRequestTimeZone } from "@/lib/dates";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { can, type Permission } from "@/lib/permissions";
import { mailEnabled } from "@/lib/mail";
import { SESSION_COOKIE, validateSessionToken } from "./session";

export async function requestMeta() {
  const h = await headers();
  // Dernière entrée : celle ajoutée par notre proxy (Caddy), que le client ne peut pas falsifier
  const ip = h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await validateSessionToken(token);
  // Adresse email à confirmer par code (seulement si l'envoi d'emails est configuré)
  return s ? { ...s, token, mustVerifyEmail: !s.emailVerifiedAt && mailEnabled() } : null;
});

/** Page où l'utilisateur doit aller avant tout le reste : code email, puis mot de passe provisoire. */
export function pendingStep(s: { mustVerifyEmail: boolean; mustChangePassword: boolean } | null) {
  if (s?.mustVerifyEmail) return "/verification";
  if (s?.mustChangePassword) return "/account/password";
  return null;
}

/**
 * Contexte complet de la requête (utilisateur + entreprise + permissions), mis en cache par requête.
 * Nul tant que l'email n'est pas vérifié ou qu'un mot de passe provisoire n'a pas été changé :
 * aucune page ni API n'est alors accessible.
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const s = await getSession();
  if (!s?.companyId || pendingStep(s)) return null;
  const ctx = await loadContext(s, s.companyId);
  if (!ctx) return null;
  const { ip } = await requestMeta();
  return { ...ctx, ip };
});

export async function requireContext(permission?: Permission): Promise<AppContext> {
  // Email à vérifier, puis mot de passe provisoire (créé ou réinitialisé par un administrateur) : avant tout le reste
  const step = pendingStep(await getSession());
  if (step) redirect(step);
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  setRequestTimeZone(ctx.company.timezone);
  if (permission && !can(ctx.permissions, permission)) redirect("/forbidden");
  return ctx;
}
