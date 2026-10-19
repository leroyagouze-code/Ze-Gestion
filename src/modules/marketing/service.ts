import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { emailCampaigns, users } from "@/db/schema";
import { BusinessError } from "@/lib/errors";
import { mailEnabled, sendMail, sendMailInBackground } from "@/lib/mail";
import { SUBSCRIPTION_FILTERS } from "@/modules/admin/service";
import { campaignEmail, welcomeEmail } from "./emails";

/**
 * E-mails aux clients de ZE Gestion : bienvenue à l'inscription, puis offres et nouveautés envoyées
 * par le super admin aux responsables d'entreprise qui les acceptent (case à l'inscription, lien de
 * désabonnement dans chaque e-mail).
 */

type Admin = { userId: string; isSuperAdmin: boolean };

function assertSuperAdmin(u: { isSuperAdmin: boolean }) {
  if (!u.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
}

const appUrl = () => process.env.APP_URL?.trim() || "https://gestion.zegroupafrica.com";
const support = () => process.env.SUPPORT_CONTACT?.trim() || "contact@zegroupafrica.com";
export const unsubscribeUrl = (token: string) => `${appUrl()}/desabonnement/${token}`;

/** Bienvenue juste après l'inscription, sans retarder la page (un échec d'envoi est seulement journalisé). */
export function sendWelcomeEmail(p: { to: string; name: string; companyName: string; trialDays: number }) {
  if (!mailEnabled()) return;
  sendMailInBackground(welcomeEmail({ ...p, appUrl: appUrl(), support: support() }));
}

/* ─────────── Destinataires ─────────── */

export const AUDIENCES = {
  all: "Tous les clients",
  trial: "En essai",
  paid: "Abonnés payants",
  expiring: "Abonnement qui expire sous 7 jours",
  readonly: "Essai fini ou impayé (lecture seule)",
  unlimited: "Accès offert",
} as const;
export type Audience = keyof typeof AUDIENCES;

export type Recipient = { userId: string; email: string; name: string; companyName: string; emailToken: string };

/** Responsables des entreprises actives qui acceptent les offres, une seule fois par adresse. */
export async function listRecipients(admin: Admin, audience: Audience): Promise<Recipient[]> {
  assertSuperAdmin(admin);
  const f = SUBSCRIPTION_FILTERS[audience]?.where;
  const res = await db.execute<Recipient>(sql`
    select distinct on (lower(u.email)) u.id as "userId", u.email, u.full_name as "name", companies.name as "companyName", u.email_token as "emailToken"
    from company_owners() o
    join ${users} u on u.id = o.user_id
    join companies on companies.id = o.company_id
    left join subscriptions on subscriptions.company_id = companies.id
    where u.marketing_opt_in and u.email_verified_at is not null and companies.status = 'active'
    ${f ? sql`and ${f}` : sql``}
    order by lower(u.email), companies.created_at`);
  return res.rows;
}

export async function audienceCounts(admin: Admin) {
  const entries = await Promise.all((Object.keys(AUDIENCES) as Audience[]).map(async (a) => [a, (await listRecipients(admin, a)).length] as const));
  return Object.fromEntries(entries) as Record<Audience, number>;
}

/* ─────────── Envoi ─────────── */

export const campaignSchema = z.object({
  subject: z.string().trim().min(3, "Objet requis").max(150),
  body: z.string().trim().min(10, "Message trop court").max(10_000),
  audience: z.enum(Object.keys(AUDIENCES) as [Audience, ...Audience[]]).default("all"),
});

/** Aperçu envoyé à l'adresse du super admin, avec ses propres nom et entreprise fictive. */
export async function sendTestCampaign(admin: Admin, raw: unknown) {
  assertSuperAdmin(admin);
  if (!mailEnabled()) throw new BusinessError("L'envoi d'e-mails n'est pas configuré sur ce serveur (SMTP_PASSWORD).");
  const input = campaignSchema.parse(raw);
  const [me] = await db.select({ email: users.email, name: users.fullName, token: users.emailToken }).from(users).where(eq(users.id, admin.userId));
  await sendMail(campaignEmail({ to: me.email, name: me.name, companyName: "Boutique Exemple", subject: `[Test] ${input.subject}`, body: input.body, unsubscribeUrl: unsubscribeUrl(me.token) }));
  return me.email;
}

// Pause entre deux e-mails : la messagerie LWS limite le nombre d'envois par heure
const delayMs = () => Number(process.env.MAIL_BATCH_DELAY_MS ?? 3000);
const running = new Set<Promise<void>>();

/** Crée l'envoi puis expédie les e-mails un par un en arrière-plan ; la page suit l'avancement. */
export async function startCampaign(admin: Admin, raw: unknown) {
  assertSuperAdmin(admin);
  if (!mailEnabled()) throw new BusinessError("L'envoi d'e-mails n'est pas configuré sur ce serveur (SMTP_PASSWORD).");
  const input = campaignSchema.parse(raw);
  const recipients = await listRecipients(admin, input.audience);
  if (!recipients.length) throw new BusinessError("Aucun destinataire pour ce choix.");
  const [c] = await db
    .insert(emailCampaigns)
    .values({ ...input, recipients: recipients.length, createdBy: admin.userId })
    .returning({ id: emailCampaigns.id });
  const p = deliver(c.id, input, recipients).finally(() => running.delete(p));
  running.add(p);
  return { id: c.id, recipients: recipients.length };
}

async function deliver(id: string, input: { subject: string; body: string }, recipients: Recipient[]) {
  let sent = 0;
  let failed = 0;
  const save = (done = false) =>
    db
      .update(emailCampaigns)
      .set({ sent, failed, ...(done ? { status: "done", finishedAt: new Date() } : {}) })
      .where(eq(emailCampaigns.id, id));
  for (const [i, r] of recipients.entries()) {
    if (i > 0 && delayMs() > 0) await new Promise((res) => setTimeout(res, delayMs()));
    // Destinataire désabonné depuis le début de l'envoi : on saute
    const [still] = await db.select({ ok: users.marketingOptIn }).from(users).where(eq(users.id, r.userId));
    if (!still?.ok) continue;
    try {
      await sendMail(campaignEmail({ to: r.email, name: r.name, companyName: r.companyName, subject: input.subject, body: input.body, unsubscribeUrl: unsubscribeUrl(r.emailToken) }));
      sent++;
    } catch (e) {
      failed++;
      console.error("[email] offre non envoyée à", r.email, e);
    }
    if ((i + 1) % 10 === 0) await save();
  }
  await save(true);
}

/** Attend la fin des envois en cours (tests). */
export async function waitForCampaigns() {
  await Promise.all([...running]);
}

export async function listCampaigns(admin: Admin) {
  assertSuperAdmin(admin);
  return db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.createdAt)).limit(30);
}

/* ─────────── Désabonnement ─────────── */

const tokenOk = (t: string) => /^[0-9a-f-]{36}$/i.test(t);

export async function subscriptionByToken(token: string) {
  if (!tokenOk(token)) return null;
  const [u] = await db.select({ email: users.email, optIn: users.marketingOptIn }).from(users).where(eq(users.emailToken, token));
  return u ?? null;
}

export async function setMarketingByToken(token: string, optIn: boolean) {
  if (!tokenOk(token)) return false;
  const res = await db.update(users).set({ marketingOptIn: optIn }).where(eq(users.emailToken, token)).returning({ id: users.id });
  return res.length > 0;
}

export async function setMarketingOptIn(userId: string, optIn: boolean) {
  await db.update(users).set({ marketingOptIn: optIn }).where(eq(users.id, userId));
}
