import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts, sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "zl_session";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const REFRESH_AFTER_MS = 24 * 3600 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function createSession(input: { userId: string; organizationId: string | null; ip?: string | null; userAgent?: string | null }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId: input.userId,
    organizationId: input.organizationId,
    expiresAt,
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string) {
  const id = hashToken(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      organizationId: sessions.organizationId,
      userId: users.id,
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
      locale: users.locale,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  // Expiration glissante, rafraîchie au plus une fois par jour
  if (row.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - REFRESH_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    row.expiresAt = expiresAt;
  }
  return row;
}

export async function setSessionOrganization(token: string, organizationId: string | null) {
  await db.update(sessions).set({ organizationId }).where(eq(sessions.id, hashToken(token)));
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/* ─────────── Limitation des tentatives de connexion ─────────── */

export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function isRateLimited(key: string) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() > ATTEMPT_WINDOW_MS) return false;
  return row.count >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(key: string) {
  const windowCutoff = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  await db
    .insert(loginAttempts)
    .values({ key, count: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: sql`case when ${loginAttempts.windowStart} < ${windowCutoff} then 1 else ${loginAttempts.count} + 1 end`,
        windowStart: sql`case when ${loginAttempts.windowStart} < ${windowCutoff} then now() else ${loginAttempts.windowStart} end`,
      },
    });
}

export async function clearAttempts(key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
