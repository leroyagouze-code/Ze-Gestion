import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { listSpaces, loadStaffContext, type StaffCtx, type TenantCtx } from "@/modules/auth/context";
import { can, type Permission } from "@/lib/permissions";
import { SESSION_COOKIE, validateSessionToken } from "./session";

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
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

export const getStaff = cache(async (): Promise<StaffCtx | null> => {
  const s = await getSession();
  if (!s?.organizationId) return null;
  const { ip } = await requestMeta();
  return loadStaffContext(s, s.organizationId, ip);
});

export const getTenant = cache(async (): Promise<TenantCtx | null> => {
  const s = await getSession();
  if (!s || s.organizationId) return null;
  const { ip } = await requestMeta();
  return { kind: "tenant", userId: s.userId, userName: s.fullName, phone: s.phone, ip };
});

/** Page d'accueil selon l'espace actif de la session */
export async function homePath() {
  const s = await getSession();
  if (!s) return "/connexion";
  if (s.organizationId) return (await getStaff()) ? "/tableau-de-bord" : "/espaces";
  return "/mon-espace";
}

export async function requireStaff(permission?: Permission): Promise<StaffCtx> {
  const s = await getSession();
  if (!s) redirect("/connexion");
  const ctx = await getStaff();
  if (!ctx) redirect(s.organizationId ? "/espaces" : "/mon-espace");
  if (permission && !can(ctx.permissions, permission)) redirect("/interdit");
  return ctx;
}

export async function requireTenant(): Promise<TenantCtx> {
  const s = await getSession();
  if (!s) redirect("/connexion");
  const ctx = await getTenant();
  if (!ctx) redirect("/tableau-de-bord");
  return ctx;
}

export { listSpaces };
