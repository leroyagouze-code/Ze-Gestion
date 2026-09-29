import nodemailer from "nodemailer";

/**
 * Envoi des emails (codes de vérification, mot de passe oublié) par SMTP : boîte noreply@zegroupafrica.com (LWS).
 *
 * Actif seulement si SMTP_PASSWORD est renseigné, et jamais dans l'édition Windows (ZE_EDITION=desktop).
 * Sans envoi possible, la vérification d'email est sautée (comptes considérés vérifiés) et le mot de passe
 * oublié renvoie vers l'administrateur. En développement, MAIL_TRANSPORT=console active les parcours
 * en écrivant les emails (et donc les codes) dans la console du serveur au lieu de les envoyer.
 */

export type MailMessage = { to: string; subject: string; text: string; html: string };
export type MailTransport = { send(msg: MailMessage & { from: string }): Promise<void> };

const env = (k: string) => process.env[k]?.trim() || undefined;

export const mailFrom = () => env("MAIL_FROM") ?? "ZE Gestion <noreply@zegroupafrica.com>";

function smtpConfigured() {
  return !!env("SMTP_PASSWORD");
}

function consoleMode() {
  return process.env.NODE_ENV !== "production" && env("MAIL_TRANSPORT") === "console";
}

// Transport imposé par les tests (null = envoi désactivé, undefined = selon la configuration)
let override: MailTransport | null | undefined;
export function setMailTransport(t: MailTransport | null | undefined) {
  override = t;
}

/** Vrai quand les emails peuvent partir : sinon pas de vérification d'adresse ni de code par email. */
export function mailEnabled() {
  if (override !== undefined) return override !== null;
  if (process.env.ZE_EDITION === "desktop") return false;
  return smtpConfigured() || consoleMode();
}

let smtp: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtpTransport() {
  smtp ??= nodemailer.createTransport({
    host: env("SMTP_HOST") ?? "mail.zegroupafrica.com",
    port: Number(env("SMTP_PORT") ?? 465),
    secure: (env("SMTP_SECURE") ?? "true") !== "false",
    auth: { user: env("SMTP_USER") ?? "noreply@zegroupafrica.com", pass: env("SMTP_PASSWORD") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return smtp;
}

export async function sendMail(msg: MailMessage) {
  const full = { ...msg, from: mailFrom() };
  if (override) return override.send(full);
  if (!mailEnabled()) throw new Error("Envoi d'emails non configuré");
  if (smtpConfigured() && !consoleMode()) {
    await smtpTransport().sendMail(full);
    return;
  }
  console.info(`[email] à ${full.to} : ${full.subject}\n${full.text}`);
}

const pending = new Set<Promise<void>>();

/**
 * Envoi sans attendre la réponse du serveur SMTP : la durée de la requête ne trahit pas
 * si l'adresse a un compte (mot de passe oublié). Les échecs sont écrits dans les journaux.
 */
export function sendMailInBackground(msg: MailMessage) {
  const p = sendMail(msg)
    .catch((e) => console.error("[email] échec de l'envoi à", msg.to, e))
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Attend les envois en cours (tests). */
export async function flushMail() {
  await Promise.all([...pending]);
}
