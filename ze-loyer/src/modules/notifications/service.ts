import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { notifications, users } from "@/db/schema";
import { activeChannels, getSender } from "./channels";

export type NotifyInput = {
  userId: string;
  organizationId: string | null;
  title: string;
  body: string;
  link?: string | null;
  /** Clé anti-doublon (ex. rappel J-3 d'un loyer) */
  dedupeKey?: string;
};

/** Crée la notification sur chaque canal actif. Renvoie false si elle existait déjà (dédoublonnage). */
export async function notify(tx: DbOrTx, n: NotifyInput) {
  const [u] = await tx.select({ id: users.id, phone: users.phone, email: users.email }).from(users).where(eq(users.id, n.userId)).limit(1);
  if (!u) return false;
  let created = false;
  for (const channel of activeChannels()) {
    const res = await getSender(channel).send({ to: { userId: u.id, phone: u.phone, email: u.email }, title: n.title, body: n.body, link: n.link ?? null });
    const inserted = await tx
      .insert(notifications)
      .values({
        userId: n.userId,
        organizationId: n.organizationId,
        channel,
        status: res.status,
        statusDetail: res.detail ?? null,
        title: n.title,
        body: n.body,
        link: n.link ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (inserted.length) created = true;
  }
  return created;
}

export async function listNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, "WEB")))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, "WEB"), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
