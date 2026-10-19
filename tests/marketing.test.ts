import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns, users } from "@/db/schema";
import { flushMail, setMailTransport, type MailMessage } from "@/lib/mail";
import { signup } from "@/modules/auth/service";
import { campaignEmail, textToHtml } from "@/modules/marketing/emails";
import {
  listRecipients,
  sendTestCampaign,
  setMarketingByToken,
  startCampaign,
  subscriptionByToken,
  waitForCampaigns,
} from "@/modules/marketing/service";

const outbox: (MailMessage & { from: string })[] = [];
beforeAll(() => {
  process.env.MAIL_BATCH_DELAY_MS = "0";
  setMailTransport({ send: async (m) => void outbox.push(m) });
});
afterAll(() => setMailTransport(undefined));
beforeEach(() => {
  outbox.length = 0;
});

async function owner(optIn: boolean, name = "Ama Offres") {
  const email = `promo-${randomUUID()}@test.local`;
  const res = await signup({ companyName: `Boutique ${name}`, ownerName: name, email, password: "motdepasse123", marketingOptIn: optIn ? "on" : undefined });
  // Adresse confirmée (sinon pas d'offres)
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, res.userId));
  const [u] = await db.select().from(users).where(eq(users.id, res.userId));
  return { ...res, email, token: u.emailToken };
}

describe("e-mails aux clients", () => {
  it("souhaite la bienvenue à l'inscription et enregistre le choix pour les offres", async () => {
    const yes = await owner(true, "Kossi Oui");
    const no = await owner(false, "Afi Non");
    await flushMail();
    const welcome = outbox.find((m) => m.to === yes.email && m.subject.startsWith("Bienvenue"));
    expect(welcome?.text).toContain("Kossi Oui");
    expect(welcome?.text).toContain("14 jours");
    expect(outbox.some((m) => m.to === no.email && m.subject.startsWith("Bienvenue"))).toBe(true);
    const [a] = await db.select({ v: users.marketingOptIn }).from(users).where(eq(users.id, yes.userId));
    const [b] = await db.select({ v: users.marketingOptIn }).from(users).where(eq(users.id, no.userId));
    expect(a.v).toBe(true);
    expect(b.v).toBe(false);
  });

  it("envoie l'offre aux seuls responsables qui l'acceptent, avec un lien de désabonnement", async () => {
    const yes = await owner(true, "Yawa Promo");
    const no = await owner(false, "Edem Refus");
    const admin = { userId: yes.userId, isSuperAdmin: true };
    const all = await listRecipients(admin, "all");
    expect(all.some((r) => r.email === yes.email)).toBe(true);
    expect(all.some((r) => r.email === no.email)).toBe(false);
    expect((await listRecipients(admin, "trial")).some((r) => r.email === yes.email)).toBe(true);
    expect((await listRecipients(admin, "paid")).some((r) => r.email === yes.email)).toBe(false);

    outbox.length = 0;
    const c = await startCampaign(admin, { subject: "Offre pour {entreprise}", body: "Bonjour {nom},\n\n-20 % ce mois-ci.", audience: "all" });
    await waitForCampaigns();
    const mine = outbox.find((m) => m.to === yes.email)!;
    expect(mine.subject).toBe("Offre pour Boutique Yawa Promo");
    expect(mine.text).toContain("Bonjour Yawa Promo,");
    expect(mine.listUnsubscribe).toContain(`/desabonnement/${yes.token}`);
    expect(outbox.some((m) => m.to === no.email)).toBe(false);
    const [row] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, c.id));
    expect(row.status).toBe("done");
    expect(row.sent).toBe(c.recipients);
  });

  it("désabonne avec le lien et n'envoie plus rien ensuite", async () => {
    const u = await owner(true, "Mawuli Stop");
    expect((await subscriptionByToken(u.token))?.optIn).toBe(true);
    expect(await setMarketingByToken(u.token, false)).toBe(true);
    expect((await subscriptionByToken(u.token))?.optIn).toBe(false);
    expect(await subscriptionByToken("pas-un-jeton")).toBeNull();
    const admin = { userId: u.userId, isSuperAdmin: true };
    expect((await listRecipients(admin, "all")).some((r) => r.email === u.email)).toBe(false);
    // Le test au super admin part quand même (aperçu)
    expect(await sendTestCampaign(admin, { subject: "Essai", body: "Un message d'essai." })).toBe(u.email);
  });

  it("refuse l'envoi à qui n'est pas super admin", async () => {
    const u = await owner(true, "Pas Admin");
    await expect(startCampaign({ userId: u.userId, isSuperAdmin: false }, { subject: "x", body: "y" })).rejects.toThrow(/réservé/);
  });

  it("met en forme le message sans laisser passer de HTML", () => {
    const html = textToHtml("Lien : https://exemple.com/promo.\n\n<script>x</script>");
    expect(html).toContain('<a href="https://exemple.com/promo"');
    expect(html).not.toContain("<script>");
    const m = campaignEmail({ to: "a@b.c", name: "A", companyName: "B", subject: "S", body: "Texte", unsubscribeUrl: "https://x/desabonnement/t" });
    expect(m.html).toContain("Ne plus recevoir nos offres");
  });
});
