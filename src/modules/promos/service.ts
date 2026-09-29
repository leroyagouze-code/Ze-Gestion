import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { promoCodes } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { localDate } from "@/lib/dates";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { normalizePromoCode, promoDiscount, promoProblem } from "@/lib/promo";
import { ctxAssert, type AppContext } from "@/modules/auth/context";
import { minPurchaseField, promoBaseSchema } from "./schemas";

/**
 * Codes promo d'une entreprise pour ses propres clients : saisis en caisse, ils deviennent une
 * remise globale sur la vente. Table soumise à la RLS (chaque entreprise ne voit que ses codes).
 */

export const promoSchema = promoBaseSchema.and(z.object({ minPurchase: minPurchaseField }));

const pgCode = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
};

/** Jour courant dans le fuseau de l'entreprise : les dates des codes s'entendent à son heure locale. */
const companyToday = (ctx: AppContext) => localDate(new Date(), ctx.company.timezone ?? undefined);

export async function listPromos(ctx: AppContext) {
  ctxAssert(ctx, "promos.manage");
  return withTenant(ctx, (tx) => tx.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)));
}

export async function savePromo(ctx: AppContext, id: string | null, raw: unknown) {
  ctxAssert(ctx, "promos.manage");
  const p = promoSchema.parse(raw);
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = id
        ? await tx.update(promoCodes).set({ ...p, updatedAt: new Date() }).where(eq(promoCodes.id, id)).returning()
        : await tx.insert(promoCodes).values({ ...p, companyId: ctx.companyId }).returning();
      if (!row) throw new NotFoundError("Code promo");
      await audit(tx, {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: id ? "promo.updated" : "promo.created",
        entityType: "promo_code",
        entityId: row.id,
        metadata: { code: row.code, kind: row.kind, value: row.value },
        ip: ctx.ip,
      });
      return row;
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new BusinessError(`Le code ${p.code} existe déjà`);
    if (pgCode(e) === "23514") throw new BusinessError("Le nombre maximal d'utilisations ne peut pas être inférieur aux utilisations déjà faites");
    throw e;
  }
}

export async function setPromoActive(ctx: AppContext, id: string, isActive: boolean) {
  ctxAssert(ctx, "promos.manage");
  await withTenant(ctx, async (tx) => {
    const [row] = await tx.update(promoCodes).set({ isActive, updatedAt: new Date() }).where(eq(promoCodes.id, id)).returning({ code: promoCodes.code });
    if (!row) throw new NotFoundError("Code promo");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: isActive ? "promo.enabled" : "promo.disabled", entityType: "promo_code", entityId: id, metadata: { code: row.code }, ip: ctx.ip });
  });
}

/** Un code déjà utilisé reste lié à ses ventes : on le désactive au lieu de le supprimer. */
export async function deletePromo(ctx: AppContext, id: string) {
  ctxAssert(ctx, "promos.manage");
  await withTenant(ctx, async (tx) => {
    const [row] = await tx.delete(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.usedCount, 0))).returning({ code: promoCodes.code });
    if (!row) throw new BusinessError("Ce code a déjà servi : désactivez-le plutôt que de le supprimer");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "promo.deleted", entityType: "promo_code", entityId: id, metadata: { code: row.code }, ip: ctx.ip });
  });
}

/**
 * Caisse : vérifie un code saisi et renvoie ses règles pour l'aperçu du total.
 * Indicatif seulement : la vente revérifie tout et recalcule la réduction.
 */
export async function lookupPromo(ctx: AppContext, rawCode: string) {
  ctxAssert(ctx, "sales.create");
  const code = normalizePromoCode(rawCode);
  if (!code) throw new BusinessError("Code promo vide");
  const [p] = await withTenant(ctx, (tx) => tx.select().from(promoCodes).where(sql`upper(${promoCodes.code}) = ${code}`));
  if (!p) throw new BusinessError("Code promo inconnu");
  const problem = promoProblem(p, companyToday(ctx));
  if (problem) throw new BusinessError(problem);
  return { code: p.code, kind: p.kind, value: p.value, minPurchase: p.minPurchase, description: p.description };
}

/**
 * Applique un code dans la transaction d'une vente : la ligne du code est verrouillée, les règles
 * revérifiées (actif, dates, plafond, achat minimum) puis une utilisation est comptée.
 * base : montant sur lequel porte la remise globale (lignes après leurs propres remises).
 */
export async function applyPromoInSale(tx: Tx, ctx: AppContext, rawCode: string, base: number, decimals: number) {
  const code = normalizePromoCode(rawCode);
  const [p] = await tx.select().from(promoCodes).where(sql`upper(${promoCodes.code}) = ${code}`).for("update");
  if (!p) throw new BusinessError("Code promo inconnu");
  const problem = promoProblem(p, companyToday(ctx), base, ctx.company.currency);
  if (problem) throw new BusinessError(problem);
  const discount = promoDiscount(p, base, decimals);
  if (discount <= 0) throw new BusinessError("Ce code promo ne réduit pas ce panier");
  // Plafond revérifié dans la requête elle-même (et par la contrainte CHECK en dernier recours)
  const [ok] = await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(and(eq(promoCodes.id, p.id), or(isNull(promoCodes.maxUses), gt(promoCodes.maxUses, promoCodes.usedCount))))
    .returning({ id: promoCodes.id });
  if (!ok) throw new BusinessError("Ce code promo a atteint son nombre maximal d'utilisations");
  return { promo: p, discount };
}

/** Vente annulée : le code récupère son utilisation. */
export async function releasePromoInSale(tx: Tx, promoId: string) {
  await tx.update(promoCodes).set({ usedCount: sql`greatest(${promoCodes.usedCount} - 1, 0)` }).where(eq(promoCodes.id, promoId));
}
