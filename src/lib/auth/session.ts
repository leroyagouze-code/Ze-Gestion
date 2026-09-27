import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, loginAttempts, sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "gs_session";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const REFRESH_AFTER_MS = 24 * 3600 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function createSession(input: {
  userId: string;
  companyId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId: input.userId,
    companyId: input.companyId,
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
      companyId: sessions.companyId,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      isSuperAdmin: users.isSuperAdmin,
      mustChangePassword: users.mustChangePassword,
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

export async function setSessionCompany(token: string, companyId: string) {
  await db.update(sessions).set({ companyId }).where(eq(sessions.id, hashToken(token)));
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(userId: string, exceptToken?: string) {
  await db
    .delete(sessions)
    .where(exceptToken ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(exceptToken))) : eq(sessions.userId, userId));
}

export async function getCompany(companyId: string) {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return c ?? null;
}

/* ─────────── Limitation des tentatives de connexion ─────────── */

export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function isRateLimited(key: string, max = MAX_ATTEMPTS, windowMs = ATTEMPT_WINDOW_MS) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() > windowMs) return false;
  return row.count >= max;
}

export async function recordFailedAttempt(key: string, windowMs = ATTEMPT_WINDOW_MS) {
  const windowCutoff = new Date(Date.now() - windowMs);
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
