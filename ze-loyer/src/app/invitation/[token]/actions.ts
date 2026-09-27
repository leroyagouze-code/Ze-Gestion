"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { getSession, requestMeta, setSessionCookie } from "@/lib/auth/server";
import { setSessionOrganization } from "@/lib/auth/session";
import { acceptInvitation } from "@/modules/invitations/service";

export async function acceptAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/mon-espace";
  try {
    const s = await getSession();
    const pwd = String(fd.get("password") ?? "");
    if (!s && pwd !== String(fd.get("confirm") ?? "")) return { error: "Les deux mots de passe ne sont pas identiques." };
    const email = String(fd.get("email") ?? "").trim().toLowerCase() || null;
    const res = await acceptInvitation(token, { currentUserId: s?.userId ?? null, password: pwd, email }, await requestMeta());
    if (res.session) await setSessionCookie(res.session.token, res.session.expiresAt);
    else if (s) await setSessionOrganization(s.token, res.organizationId);
    if (res.organizationId) target = "/tableau-de-bord";
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}
