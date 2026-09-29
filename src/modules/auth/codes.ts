import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { emailCodes } from "@/db/schema";

/**
 * Codes à 6 chiffres envoyés par email. Tirés au hasard (crypto), seule l'empreinte est stockée,
 * valables 10 minutes, 5 essais au plus, à usage unique ; un nouveau code annule le précédent.
 */
export type CodePurpose = "verify_email" | "reset_password";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_COOLDOWN_MS = 60_000;

export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Lié au compte et à l'usage : un code de vérification ne sert pas à réinitialiser le mot de passe.
function hashCode(userId: string, purpose: CodePurpose, code: string) {
  return createHash("sha256").update(`${userId}:${purpose}:${code}`).digest("hex");
}

export function normalizeCode(raw: string) {
  return raw.replace(/\s+/g, "");
}

/** Secondes à attendre avant de pouvoir redemander un code (0 si possible). */
export async function codeCooldown(userId: string, purpose: CodePurpose) {
  const [last] = await db
    .select({ createdAt: emailCodes.createdAt })
    .from(emailCodes)
    .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose)))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (!last) return 0;
  const left = last.createdAt.getTime() + CODE_RESEND_COOLDOWN_MS - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Crée un nouveau code (les précédents du même usage sont annulés) et le renvoie en clair, pour l'email seulement. */
export async function issueCode(userId: string, purpose: CodePurpose) {
  const code = generateCode();
  const now = new Date();
  const id = await db.transaction(async (tx) => {
    // Ménage : les anciens codes du compte ne servent plus à rien
    await tx.delete(emailCodes).where(and(eq(emailCodes.userId, userId), lt(emailCodes.createdAt, new Date(now.getTime() - 86_400_000))));
    await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose), isNull(emailCodes.consumedAt)));
    const [row] = await tx
      .insert(emailCodes)
      .values({ userId, purpose, codeHash: hashCode(userId, purpose, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) })
      .returning({ id: emailCodes.id });
    return row.id;
  });
  return { id, code };
}

export async function deleteCode(id: string) {
  await db.delete(emailCodes).where(eq(emailCodes.id, id));
}

export type CodeCheck = { ok: true } | { ok: false; reason: "missing" | "expired" | "locked" | "wrong"; attemptsLeft: number };

/**
 * Vérifie un code : un essai faux est compté (5 au plus), un code juste est consommé.
 * Le code courant est verrouillé (FOR UPDATE) : deux essais simultanés ne dépassent pas la limite.
 */
export async function checkCode(userId: string, purpose: CodePurpose, raw: string): Promise<CodeCheck> {
  const code = normalizeCode(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emailCodes)
      .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose), isNull(emailCodes.consumedAt)))
      .orderBy(desc(emailCodes.createdAt))
      .limit(1)
      .for("update");
    if (!row) return { ok: false, reason: "missing", attemptsLeft: 0 } as const;
    if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired", attemptsLeft: 0 } as const;
    if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: "locked", attemptsLeft: 0 } as const;
    const expected = Buffer.from(row.codeHash, "hex");
    const given = Buffer.from(hashCode(userId, purpose, /^\d{6}$/.test(code) ? code : "invalid"), "hex");
    if (timingSafeEqual(expected, given)) {
      await tx.update(emailCodes).set({ consumedAt: new Date() }).where(eq(emailCodes.id, row.id));
      return { ok: true } as const;
    }
    const attempts = row.attempts + 1;
    await tx.update(emailCodes).set({ attempts }).where(eq(emailCodes.id, row.id));
    const attemptsLeft = CODE_MAX_ATTEMPTS - attempts;
    return { ok: false, reason: attemptsLeft > 0 ? "wrong" : "locked", attemptsLeft } as const;
  });
}
