"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { clearSessionCookie, getSession, requestMeta, setSessionCookie } from "@/lib/auth/server";
import { deleteSession } from "@/lib/auth/session";
import { formToObject } from "@/lib/zod";
import { changePassword, login, signup } from "@/modules/auth/service";

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let ok = false;
  try {
    const { session } = await signup(formToObject(fd) as never, await requestMeta());
    await setSessionCookie(session.token, session.expiresAt);
    ok = true;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  if (ok) redirect("/settings/company?welcome=1");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/";
  try {
    const res = await login({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") }, await requestMeta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
    if (!res.companyId) target = res.isSuperAdmin ? "/admin" : "/login?error=no_company";
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) redirect("/login");
  try {
    await changePassword(
      { userId: s.userId, companyId: s.companyId, ip: (await requestMeta()).ip },
      { current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? ""), confirm: String(fd.get("confirm") ?? "") },
      s.token,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/?password=changed");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await deleteSession(s.token);
  await clearSessionCookie();
  redirect("/login");
}
