import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { can, type Permission } from "@/lib/permissions";
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
  return s ? { ...s, token } : null;
});

/**
 * Contexte complet de la requête (utilisateur + entreprise + permissions), mis en cache par requête.
 * Nul tant qu'un mot de passe provisoire n'a pas été changé : aucune page ni API n'est alors accessible.
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const s = await getSession();
  if (!s?.companyId || s.mustChangePassword) return null;
  const ctx = await loadContext(s, s.companyId);
  if (!ctx) return null;
  const { ip } = await requestMeta();
  return { ...ctx, ip };
});

export async function requireContext(permission?: Permission): Promise<AppContext> {
  // Mot de passe provisoire (créé ou réinitialisé par un administrateur) : à changer avant tout le reste
  if ((await getSession())?.mustChangePassword) redirect("/account/password");
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (permission && !can(ctx.permissions, permission)) redirect("/forbidden");
  return ctx;
}
