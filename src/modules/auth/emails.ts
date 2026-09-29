import { APP_NAME, APP_PUBLISHER } from "@/lib/brand";
import type { MailMessage } from "@/lib/mail";
import type { CodePurpose } from "./codes";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY: Record<CodePurpose, { subject: string; intro: string; outro: string }> = {
  verify_email: {
    subject: `Votre code de vérification ${APP_NAME}`,
    intro: `Voici le code pour confirmer votre adresse email sur ${APP_NAME} :`,
    outro: "Si vous n'avez pas créé de compte, ignorez simplement cet email.",
  },
  reset_password: {
    subject: `Réinitialisation de votre mot de passe ${APP_NAME}`,
    intro: `Vous avez demandé à changer le mot de passe de votre compte ${APP_NAME}. Voici votre code :`,
    outro: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
  },
};

/** Email en français, HTML simple + texte, avec le code à 6 chiffres. */
export function codeEmail(purpose: CodePurpose, to: string, name: string, code: string, ttlMinutes: number): MailMessage {
  const c = COPY[purpose];
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  const validity = `Ce code est valable ${ttlMinutes} minutes et ne peut servir qu'une fois. Ne le communiquez à personne.`;
  const text = [hello, "", c.intro, "", `    ${code}`, "", validity, "", c.outro, "", `— L'équipe ${APP_NAME} (${APP_PUBLISHER})`].join("\n");
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:20px;font-weight:bold;color:#0f172a;padding-bottom:16px">${esc(APP_NAME)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:8px">${esc(hello)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:16px">${esc(c.intro)}</td></tr>
<tr><td align="center" style="padding:8px 0 20px"><span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:8px;background:#f1f5f9;border-radius:8px;padding:12px 20px">${esc(code)}</span></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#475569;padding-bottom:12px">${esc(validity)}</td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#475569">${esc(c.outro)}</td></tr>
<tr><td style="font-size:12px;color:#94a3b8;padding-top:24px">${esc(APP_NAME)} · ${esc(APP_PUBLISHER)} · email automatique, merci de ne pas répondre.</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject: c.subject, text, html };
}
