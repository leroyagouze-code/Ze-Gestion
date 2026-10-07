"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { clearSessionCookie, getSession, requestMeta, setSessionCookie } from "@/lib/auth/server";
import { deleteSession, setSessionOrganization } from "@/lib/auth/session";
import { formToObject } from "@/lib/zod";
import { listSpaces } from "@/modules/auth/context";
import { login, signup } from "@/modules/auth/service";

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/tableau-de-bord?bienvenue=1";
  try {
    const res = await signup(formToObject(fd), await requestMeta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
    if (!res.orgId) target = "/mon-espace";
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/tableau-de-bord";
  try {
    const res = await login({ identifier: String(fd.get("identifier") ?? ""), password: String(fd.get("password") ?? "") }, await requestMeta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
    if (!res.organizationId) target = "/mon-espace";
    const next = String(fd.get("next") ?? "");
    if (next.startsWith("/") && !next.startsWith("//")) target = next;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await deleteSession(s.token);
  await clearSessionCookie();
  redirect("/connexion");
}

/** Changer d'espace : une organisation dont on est membre, ou l'espace locataire */
export async function switchSpaceAction(fd: FormData) {
  const s = await getSession();
  if (!s) redirect("/connexion");
  const target = String(fd.get("space") ?? "");
  const spaces = await listSpaces(s.userId);
  if (target === "tenant" && spaces.isTenant) {
    await setSessionOrganization(s.token, null);
    redirect("/mon-espace");
  }
  if (spaces.orgs.some((o) => o.id === target)) {
    await setSessionOrganization(s.token, target);
    redirect("/tableau-de-bord");
  }
  redirect("/espaces");
}
