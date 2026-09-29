"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { clearSessionCookie, getSession, requestMeta, setSessionCookie } from "@/lib/auth/server";
import { deleteSession } from "@/lib/auth/session";
import { formToObject } from "@/lib/zod";
import {
  changePassword,
  login,
  requestPasswordReset,
  resetPasswordWithCode,
  sendVerificationCode,
  signup,
  verifyEmailCode,
} from "@/modules/auth/service";

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/settings/company?welcome=1";
  try {
    const { session, mustVerifyEmail } = await signup(formToObject(fd) as never, await requestMeta());
    await setSessionCookie(session.token, session.expiresAt);
    if (mustVerifyEmail) target = "/verification?welcome=1";
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/";
  try {
    const res = await login({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") }, await requestMeta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
    if (res.mustVerifyEmail) {
      // Première connexion d'un compte créé par un administrateur (ou inscription non confirmée) : code par email.
      // Un code encore récent ou un envoi impossible n'empêchent pas d'aller sur la page (« Renvoyer le code »).
      await sendVerificationCode(res.userId).catch(() => {});
      target = "/verification";
    } else if (!res.companyId) target = res.isSuperAdmin ? "/admin" : "/login?error=no_company";
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function verifyEmailAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) redirect("/login");
  try {
    await verifyEmailCode(s.userId, String(fd.get("code") ?? ""), await requestMeta());
  } catch (e) {
    return { error: errorMessage(e) };
  }
  if (!s.companyId && s.isSuperAdmin && !s.mustChangePassword) redirect("/admin");
  redirect(fd.get("welcome") === "1" && !s.mustChangePassword ? "/settings/company?welcome=1" : "/");
}

export async function resendVerificationAction(_: ActionState): Promise<ActionState> {
  const s = await getSession();
  if (!s) redirect("/login");
  try {
    await sendVerificationCode(s.userId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: `Nouveau code envoyé à ${s.email}.` };
}

/** Mot de passe oublié, étape 1 : même réponse que l'adresse ait un compte ou non. */
export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  try {
    await requestPasswordReset({ email }, await requestMeta());
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/mot-de-passe-oublie?email=${encodeURIComponent(email)}`);
}

/** Mot de passe oublié, étape 2 : code + nouveau mot de passe ; toutes les sessions sont fermées. */
export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await resetPasswordWithCode(
      {
        email: String(fd.get("email") ?? ""),
        code: String(fd.get("code") ?? ""),
        password: String(fd.get("password") ?? ""),
        confirm: String(fd.get("confirm") ?? ""),
      },
      await requestMeta(),
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await clearSessionCookie();
  redirect("/login?reset=1");
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
