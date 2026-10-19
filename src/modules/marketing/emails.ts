import { APP_NAME, APP_PUBLISHER } from "@/lib/brand";
import type { MailMessage } from "@/lib/mail";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Texte simple en HTML : paragraphes séparés par une ligne vide, retours à la ligne gardés, liens cliquables. */
export function textToHtml(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => {
      const html = esc(p.trim())
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#0f766e">${u}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${html}</p>`;
    })
    .join("\n");
}

function shell(inner: string, footer: string) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:20px;font-weight:bold;color:#0f766e;padding-bottom:18px">${esc(APP_NAME)}</td></tr>
<tr><td>${inner}</td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#94a3b8;padding-top:20px;border-top:1px solid #e2e8f0">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:6px 0 20px"><a href="${esc(href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px;padding:12px 22px">${esc(label)}</a></p>`;

/** E-mail de bienvenue envoyé juste après l'inscription. */
export function welcomeEmail(p: { to: string; name: string; companyName: string; appUrl: string; trialDays: number; support: string }): MailMessage {
  const hello = p.name ? `Bonjour ${p.name},` : "Bonjour,";
  const intro = `Bienvenue sur ${APP_NAME} ! L'espace de ${p.companyName} est prêt. Vous profitez de ${p.trialDays} jours d'essai gratuit, avec toutes les fonctions.`;
  const steps = [
    "Complétez votre entreprise : logo, adresse et format des tickets (Paramètres).",
    "Ajoutez vos produits, à la main ou en important votre liste.",
    "Faites votre première vente à la caisse et imprimez le ticket.",
    "Ajoutez vos employés avec leurs rôles (caissier, gérant…).",
  ];
  const help = `Une question ? Contactez-nous : ${p.support}.`;
  const subject = `Bienvenue sur ${APP_NAME}, ${p.companyName} !`;
  const text = [hello, "", intro, "", "Pour bien démarrer :", ...steps.map((s, i) => `${i + 1}. ${s}`), "", `Ouvrir ${APP_NAME} : ${p.appUrl}`, "", help, "", `— L'équipe ${APP_NAME} (${APP_PUBLISHER})`].join("\n");
  const inner = `
<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(hello)}</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(intro)}</p>
<p style="margin:0 0 8px;font-size:15px;font-weight:bold">Pour bien démarrer :</p>
<ol style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.6">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
${button(p.appUrl, `Ouvrir ${APP_NAME}`)}
<p style="margin:0;font-size:14px;line-height:1.55;color:#475569">${esc(help)}</p>`;
  return { to: p.to, subject, text, html: shell(inner, `${esc(APP_NAME)} · ${esc(APP_PUBLISHER)}`) };
}

/** Remplace {nom} et {entreprise} dans l'objet ou le message d'une offre. */
export function personalize(s: string, v: { name: string; companyName: string }) {
  return s.replace(/\{nom\}/gi, v.name).replace(/\{entreprise\}/gi, v.companyName);
}

/** E-mail d'offre ou de nouveauté, toujours avec le lien de désabonnement. */
export function campaignEmail(p: { to: string; name: string; companyName: string; subject: string; body: string; unsubscribeUrl: string }): MailMessage {
  const vars = { name: p.name, companyName: p.companyName };
  const subject = personalize(p.subject, vars);
  const body = personalize(p.body, vars);
  const why = `Vous recevez cet e-mail car vous utilisez ${APP_NAME} pour ${p.companyName}.`;
  const text = [body.trim(), "", `— L'équipe ${APP_NAME} (${APP_PUBLISHER})`, "", why, `Ne plus recevoir nos offres : ${p.unsubscribeUrl}`].join("\n");
  const footer = `${esc(why)}<br><a href="${esc(p.unsubscribeUrl)}" style="color:#64748b">Ne plus recevoir nos offres</a> · ${esc(APP_PUBLISHER)}`;
  return { to: p.to, subject, text, html: shell(textToHtml(body), footer), listUnsubscribe: p.unsubscribeUrl };
}
