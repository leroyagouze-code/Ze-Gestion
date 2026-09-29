import { and, desc, eq, gt, isNull, lte, gte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { platformPromoCodes } from "@/db/schema";
import { localDate } from "@/lib/dates";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { normalizePromoCode, promoDiscount, promoProblem } from "@/lib/promo";
import { promoBaseSchema } from "@/modules/promos/schemas";

/**
 * Codes promo de la plateforme ZE Gestion, gérés par le super admin : réductions sur les achats de
 * licence en ligne et sur les paiements d'abonnement. Le prix réduit est toujours recalculé ici à
 * partir du tarif en base ; le navigateur n'envoie que le code.
 */

type Admin = { userId: string; isSuperAdmin: boolean };

export const PROMO_SCOPES = { all: "Licences et abonnements", license: "Achats de licence", subscription: "Abonnements" } as const;
export type PromoScope = keyof typeof PROMO_SCOPES;
export const PROMO_PLANS = ["BASIC", "PRO", "BUSINESS"] as const;

/** Montant minimum payable en ligne : un code ne rend jamais une licence gratuite. */
export const LICENSE_MIN_AMOUNT = 100;

function assertSuperAdmin(u: { isSuperAdmin: boolean }) {
  if (!u.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
}

/** Jour courant de la plateforme (les dates des codes s'entendent à l'heure de Lomé par défaut). */
export const platformToday = (now = new Date()) => localDate(now, process.env.PLATFORM_TIMEZONE || "Africa/Lome");

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/* ─────────── Gestion (super admin) ─────────── */

export const platformPromoSchema = promoBaseSchema.and(
  z.object({
    scope: z.enum(Object.keys(PROMO_SCOPES) as [PromoScope, ...PromoScope[]]).default("all"),
    plans: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
      .pipe(z.array(z.enum(PROMO_PLANS))),
  }),
);

export async function listPlatformPromos(admin: Admin) {
  assertSuperAdmin(admin);
  return db.select().from(platformPromoCodes).orderBy(desc(platformPromoCodes.createdAt));
}

export async function savePlatformPromo(admin: Admin, id: string | null, raw: unknown) {
  assertSuperAdmin(admin);
  const p = platformPromoSchema.parse(raw);
  try {
    if (id) {
      const [row] = await db
        .update(platformPromoCodes)
        .set({ ...p, updatedAt: new Date() })
        .where(eq(platformPromoCodes.id, id))
        .returning();
      if (!row) throw new NotFoundError("Code promo");
      return row;
    }
    const [row] = await db.insert(platformPromoCodes).values({ ...p, createdBy: admin.userId }).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new BusinessError(`Le code ${p.code} existe déjà`);
    // plafond abaissé sous le nombre d'utilisations déjà faites (contrainte CHECK)
    if ((e as { code?: string; cause?: { code?: string } })?.cause?.code === "23514" || (e as { code?: string })?.code === "23514") {
      throw new BusinessError("Le nombre maximal d'utilisations ne peut pas être inférieur aux utilisations déjà faites");
    }
    throw e;
  }
}

export async function setPlatformPromoActive(admin: Admin, id: string, isActive: boolean) {
  assertSuperAdmin(admin);
  await db.update(platformPromoCodes).set({ isActive, updatedAt: new Date() }).where(eq(platformPromoCodes.id, id));
}

/** Un code déjà utilisé reste dans l'historique des commandes : on le désactive au lieu de le supprimer. */
export async function deletePlatformPromo(admin: Admin, id: string) {
  assertSuperAdmin(admin);
  const [row] = await db
    .delete(platformPromoCodes)
    .where(and(eq(platformPromoCodes.id, id), eq(platformPromoCodes.usedCount, 0)))
    .returning({ id: platformPromoCodes.id });
  if (!row) throw new BusinessError("Ce code a déjà servi : désactivez-le plutôt que de le supprimer");
}

/* ─────────── Application ─────────── */

export type PlatformPromoTarget = { target: "license" | "subscription"; plan: string; amount: number; decimals?: number };

/**
 * Vérifie un code pour un achat donné et calcule la réduction (sans consommer d'utilisation).
 * Lève une BusinessError lisible si le code ne s'applique pas.
 */
export async function quotePlatformPromo(rawCode: string, t: PlatformPromoTarget, runner: Pick<Tx, "select"> = db) {
  const code = normalizePromoCode(rawCode);
  if (!code) throw new BusinessError("Code promo vide");
  const [promo] = await runner.select().from(platformPromoCodes).where(sql`upper(${platformPromoCodes.code}) = ${code}`);
  if (!promo) throw new BusinessError("Code promo inconnu");
  const problem = promoProblem(promo, platformToday());
  if (problem) throw new BusinessError(problem);
  if (promo.scope !== "all" && promo.scope !== t.target) {
    throw new BusinessError(t.target === "license" ? "Ce code promo ne s'applique pas aux licences" : "Ce code promo ne s'applique pas aux abonnements");
  }
  if (promo.plans.length > 0 && !promo.plans.includes(t.plan)) {
    throw new BusinessError(`Ce code promo est réservé à la formule ${promo.plans.join(", ")}`);
  }
  let discount = promoDiscount(promo, t.amount, t.decimals ?? 0);
  if (t.target === "license") discount = Math.max(0, Math.min(discount, t.amount - LICENSE_MIN_AMOUNT));
  if (discount <= 0) throw new BusinessError("Ce code promo ne réduit pas ce prix");
  return { promo, discount, amount: t.amount - discount };
}

/**
 * Consomme une utilisation, en une seule requête qui revérifie actif, dates et plafond :
 * deux achats simultanés ne peuvent pas dépasser le nombre maximal d'utilisations.
 */
export async function reservePlatformPromo(tx: Tx, promoId: string) {
  const today = platformToday();
  const [row] = await tx
    .update(platformPromoCodes)
    .set({ usedCount: sql`${platformPromoCodes.usedCount} + 1` })
    .where(
      and(
        eq(platformPromoCodes.id, promoId),
        eq(platformPromoCodes.isActive, true),
        or(isNull(platformPromoCodes.startsOn), lte(platformPromoCodes.startsOn, today)),
        or(isNull(platformPromoCodes.endsOn), gte(platformPromoCodes.endsOn, today)),
        or(isNull(platformPromoCodes.maxUses), gt(platformPromoCodes.maxUses, platformPromoCodes.usedCount)),
      ),
    )
    .returning({ id: platformPromoCodes.id });
  if (!row) throw new BusinessError("Ce code promo n'est plus disponible");
}

/** Rend l'utilisation d'un achat qui n'a pas abouti (paiement échoué). */
export async function releasePlatformPromo(tx: Tx, promoId: string) {
  await tx
    .update(platformPromoCodes)
    .set({ usedCount: sql`greatest(${platformPromoCodes.usedCount} - 1, 0)` })
    .where(eq(platformPromoCodes.id, promoId));
}
