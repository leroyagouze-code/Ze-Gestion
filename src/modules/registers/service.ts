import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Tx } from "@/db";
import { cashSessions, memberships, paymentMethods, payments, registers, sales, stores, users, type CashSessionSummary } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { assertOwned } from "@/db/owned";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { currencyDecimals, round } from "@/lib/money";
import { pageParams } from "@/lib/pagination";
import { num, optText } from "@/lib/zod";
import { ctxAssert, ctxCan, type AppContext } from "@/modules/auth/context";

/**
 * Caisses et sessions de caisse.
 *
 * Une boutique qui a au moins une caisse active exige une session ouverte pour encaisser :
 * le caissier choisit sa caisse, saisit le fond de caisse, vend, puis clôture en comptant ses espèces.
 * Sans caisse configurée, la vente fonctionne comme avant (ventes sans caisse ni session).
 */

/** Identifiant lu dans l'URL (filtres) : ignoré s'il n'a pas la forme d'un UUID. */
export const uuidParam = (v: string | undefined) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined);

const uniqueViolation =(e: unknown) =>
  ((e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code) === "23505";

/** Seuls ceux qui voient les ventes de tous voient (et clôturent) les sessions des autres. */
const seesAll = (ctx: AppContext) => ctxCan(ctx, "sales.view_all");

/* ───────────── Caisses ───────────── */

export async function listRegisters(ctx: AppContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: registers.id,
        number: registers.number,
        name: registers.name,
        isActive: registers.isActive,
        storeId: registers.storeId,
        storeName: stores.name,
        openSessionId: cashSessions.id,
        openedBy: users.fullName,
        openedAt: cashSessions.openedAt,
      })
      .from(registers)
      .innerJoin(stores, eq(stores.id, registers.storeId))
      .leftJoin(cashSessions, and(eq(cashSessions.registerId, registers.id), eq(cashSessions.status, "open")))
      .leftJoin(users, eq(users.id, cashSessions.openedBy))
      .orderBy(registers.number),
  );
}

/** Boutiques actives où l'on peut installer une caisse. */
export async function listRegisterStores(ctx: AppContext) {
  ctxAssert(ctx, "registers.manage");
  return withTenant(ctx, (tx) =>
    tx.select({ id: stores.id, name: stores.name }).from(stores).where(and(eq(stores.isActive, true), eq(stores.kind, "store"))).orderBy(stores.name),
  );
}

const registerSchema = z.object({
  name: optText(60),
  storeId: z.string().uuid("Choisissez une boutique"),
});

export async function createRegister(ctx: AppContext, raw: z.input<typeof registerSchema>) {
  ctxAssert(ctx, "registers.manage");
  const input = registerSchema.parse(raw);
  try {
    return await withTenant(ctx, async (tx) => {
      await assertOwned(tx, stores, input.storeId, "Boutique");
      const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${registers.number}), 0)::int + 1` }).from(registers);
      const [r] = await tx
        .insert(registers)
        .values({ companyId: ctx.companyId, storeId: input.storeId, number: next, name: input.name ?? `Caisse ${next}` })
        .returning({ id: registers.id });
      await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "register.created", entityType: "register", entityId: r.id, metadata: { number: next }, ip: ctx.ip });
      return r.id;
    });
  } catch (e) {
    if (uniqueViolation(e)) throw new BusinessError("Une autre caisse vient d'être créée : réessayez");
    throw e;
  }
}

export async function updateRegister(ctx: AppContext, id: string, patch: { name?: string; isActive?: boolean }) {
  ctxAssert(ctx, "registers.manage");
  const name = patch.name?.trim();
  if (patch.name !== undefined && (!name || name.length > 60)) throw new BusinessError("Nom de caisse invalide");
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(registers).where(eq(registers.id, id));
    if (!r) throw new NotFoundError("Caisse");
    if (patch.isActive === false) {
      const [open] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.registerId, id), eq(cashSessions.status, "open")));
      if (open) throw new BusinessError("Cette caisse a une session ouverte : clôturez-la avant de la désactiver");
    }
    await tx
      .update(registers)
      .set({ ...(name ? { name } : {}), ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}) })
      .where(eq(registers.id, id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "register.updated", entityType: "register", entityId: id, metadata: patch, ip: ctx.ip });
  });
}

/* ───────────── Sessions ───────────── */

async function openSessionOf(tx: Tx, userId: string) {
  const [s] = await tx
    .select({ id: cashSessions.id, registerId: cashSessions.registerId, storeId: cashSessions.storeId, openedAt: cashSessions.openedAt, openingFloat: cashSessions.openingFloat, registerName: registers.name })
    .from(cashSessions)
    .innerJoin(registers, eq(registers.id, cashSessions.registerId))
    .where(and(eq(cashSessions.openedBy, userId), eq(cashSessions.status, "open")))
    .limit(1);
  return s ?? null;
}

/** La boutique de l'utilisateur utilise-t-elle des caisses (au moins une active) ? */
async function storeUsesRegisters(tx: Tx, storeId: string) {
  const [r] = await tx.select({ id: registers.id }).from(registers).where(and(eq(registers.storeId, storeId), eq(registers.isActive, true))).limit(1);
  return !!r;
}

/**
 * Session à laquelle rattacher une vente, appelée dans la transaction de la vente.
 * La ligne est verrouillée en partage : une clôture simultanée attend la fin de la vente
 * (et une vente qui arrive après la clôture ne trouve plus de session ouverte).
 */
export async function sessionForSale(tx: Tx, ctx: AppContext) {
  const [s] = await tx
    .select({ id: cashSessions.id, registerId: cashSessions.registerId })
    .from(cashSessions)
    .where(and(eq(cashSessions.openedBy, ctx.userId), eq(cashSessions.status, "open")))
    .limit(1)
    .for("share");
  if (s) return s;
  if (await storeUsesRegisters(tx, ctx.storeId)) throw new BusinessError("Ouvrez votre caisse (fond de caisse) avant d'encaisser");
  return null;
}

/** État de la caisse pour l'écran de vente : session en cours, ou caisses proposées à l'ouverture. */
export async function posSessionState(ctx: AppContext) {
  ctxAssert(ctx, "sales.create");
  return withTenant(ctx, async (tx) => {
    const session = await openSessionOf(tx, ctx.userId);
    const required = await storeUsesRegisters(tx, ctx.storeId);
    const list = await tx
      .select({ id: registers.id, name: registers.name, busyBy: users.fullName })
      .from(registers)
      .leftJoin(cashSessions, and(eq(cashSessions.registerId, registers.id), eq(cashSessions.status, "open")))
      .leftJoin(users, eq(users.id, cashSessions.openedBy))
      .where(and(eq(registers.storeId, ctx.storeId), eq(registers.isActive, true)))
      .orderBy(registers.number);
    const [m] = await tx.select({ registerId: memberships.registerId }).from(memberships).where(and(eq(memberships.userId, ctx.userId), eq(memberships.companyId, ctx.companyId))).limit(1);
    return { required, session, registers: list, defaultRegisterId: m?.registerId ?? null };
  });
}

const openSchema = z.object({ registerId: z.string().uuid("Choisissez une caisse"), openingFloat: num() });

export async function openCashSession(ctx: AppContext, raw: z.input<typeof openSchema>) {
  ctxAssert(ctx, "sales.create");
  const input = openSchema.parse(raw);
  try {
    return await withTenant(ctx, async (tx) => {
      const [r] = await tx.select().from(registers).where(eq(registers.id, input.registerId));
      if (!r) throw new NotFoundError("Caisse");
      if (!r.isActive) throw new BusinessError("Cette caisse est désactivée");
      if (r.storeId !== ctx.storeId) throw new BusinessError("Cette caisse appartient à une autre boutique");
      if (await openSessionOf(tx, ctx.userId)) throw new BusinessError("Vous avez déjà une session de caisse ouverte");
      const [s] = await tx
        .insert(cashSessions)
        .values({ companyId: ctx.companyId, registerId: r.id, storeId: r.storeId, openedBy: ctx.userId, openingFloat: round(input.openingFloat, currencyDecimals(ctx.company.currency)) })
        .returning({ id: cashSessions.id });
      await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "cash_session.opened", entityType: "cash_session", entityId: s.id, metadata: { register: r.name, openingFloat: input.openingFloat }, ip: ctx.ip });
      return s.id;
    });
  } catch (e) {
    if (uniqueViolation(e)) throw new BusinessError("Cette caisse est déjà ouverte par un autre caissier");
    throw e;
  }
}

/**
 * Totaux d'une session : ventes, annulations, remises, crédit accordé et encaissements par moyen.
 * L'argent d'une vente annulée est considéré comme rendu au client (il ne compte plus en caisse).
 * Le crédit accordé = total − paiements reçus au moment de la vente (même transaction, donc même horodatage).
 */
export async function computeSessionSummary(tx: Tx, sessionId: string, decimals: number): Promise<CashSessionSummary> {
  const [agg] = (
    await tx.execute(sql`
      select count(*) filter (where s.status = 'completed')::int as "salesCount",
             coalesce(sum(s.total) filter (where s.status = 'completed'), 0)::float8 as "salesTotal",
             count(*) filter (where s.status = 'cancelled')::int as "cancelledCount",
             coalesce(sum(s.total) filter (where s.status = 'cancelled'), 0)::float8 as "cancelledTotal",
             coalesce(sum(s.discount_total) filter (where s.status = 'completed'), 0)::float8 as "discountTotal",
             count(*) filter (where s.status = 'completed' and s.credit > 0)::int as "creditCount",
             coalesce(sum(s.credit) filter (where s.status = 'completed'), 0)::float8 as "creditTotal"
        from (select x.status, x.total, x.discount_total,
                     greatest(x.total - coalesce((select sum(p.amount) from payments p where p.sale_id = x.id and p.created_at = x.created_at), 0), 0) as credit
                from sales x where x.cash_session_id = ${sessionId}) s`)
  ).rows as { salesCount: number; salesTotal: number; cancelledCount: number; cancelledTotal: number; discountTotal: number; creditCount: number; creditTotal: number }[];
  const methods = await tx
    .select({ method: paymentMethods.label, type: paymentMethods.type, count: sql<number>`count(*)::int`, total: sql<number>`sum(${payments.amount})::float8` })
    .from(payments)
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
    .where(and(eq(payments.cashSessionId, sessionId), sql`not exists (select 1 from ${sales} where ${sales.id} = ${payments.saleId} and ${sales.status} = 'cancelled')`))
    .groupBy(paymentMethods.label, paymentMethods.type, paymentMethods.sortOrder)
    .orderBy(paymentMethods.sortOrder);
  const byMethod = methods.map((m) => ({ method: m.method, type: m.type as string, count: m.count, total: round(m.total, decimals) }));
  if (agg.creditTotal > 0) byMethod.push({ method: "Crédit (reste dû)", type: "credit", count: agg.creditCount, total: round(agg.creditTotal, decimals) });
  return {
    salesCount: agg.salesCount,
    salesTotal: round(agg.salesTotal, decimals),
    cancelledCount: agg.cancelledCount,
    cancelledTotal: round(agg.cancelledTotal, decimals),
    discountTotal: round(agg.discountTotal, decimals),
    creditTotal: round(agg.creditTotal, decimals),
    cashIn: round(byMethod.filter((m) => m.type === "cash").reduce((s, m) => s + m.total, 0), decimals),
    byMethod,
  };
}

const opener = alias(users, "opener");
const closer = alias(users, "closer");

const sessionColumns = {
  id: cashSessions.id,
  status: cashSessions.status,
  registerId: cashSessions.registerId,
  registerName: registers.name,
  storeName: stores.name,
  openedBy: cashSessions.openedBy,
  openedByName: opener.fullName,
  openedAt: cashSessions.openedAt,
  openingFloat: cashSessions.openingFloat,
  closedByName: closer.fullName,
  closedAt: cashSessions.closedAt,
  expectedCash: cashSessions.expectedCash,
  countedCash: cashSessions.countedCash,
  difference: cashSessions.difference,
  forced: cashSessions.forced,
  closingNotes: cashSessions.closingNotes,
  summary: cashSessions.summary,
};

function sessionQuery(tx: Tx) {
  return tx
    .select(sessionColumns)
    .from(cashSessions)
    .innerJoin(registers, eq(registers.id, cashSessions.registerId))
    .innerJoin(stores, eq(stores.id, cashSessions.storeId))
    .leftJoin(opener, eq(opener.id, cashSessions.openedBy))
    .leftJoin(closer, eq(closer.id, cashSessions.closedBy));
}

/** Détail d'une session avec ses totaux (figés à la clôture, calculés en direct tant qu'elle est ouverte). */
export async function getCashSession(ctx: AppContext, id: string) {
  ctxAssert(ctx, "sales.view");
  const decimals = currencyDecimals(ctx.company.currency);
  return withTenant(ctx, async (tx) => {
    const [s] = await sessionQuery(tx).where(eq(cashSessions.id, id));
    if (!s || (!seesAll(ctx) && s.openedBy !== ctx.userId)) throw new NotFoundError("Session de caisse");
    const summary = s.status === "closed" && s.summary ? s.summary : await computeSessionSummary(tx, id, decimals);
    const expectedCash = s.status === "closed" && s.expectedCash != null ? s.expectedCash : round(s.openingFloat + summary.cashIn, decimals);
    return { ...s, summary, expectedCash };
  });
}

const closeSchema = z.object({ countedCash: num(), notes: optText(500) });

/**
 * Clôture : espèces attendues = fond de caisse + encaissements en espèces (hors ventes annulées),
 * écart = compté − attendu. Le caissier clôture sa propre session ; un responsable
 * (ventes de tous les vendeurs) peut clôturer celle d'un autre (clôture forcée).
 */
export async function closeCashSession(ctx: AppContext, id: string, raw: z.input<typeof closeSchema>) {
  const input = closeSchema.parse(raw);
  const decimals = currencyDecimals(ctx.company.currency);
  return withTenant(ctx, async (tx) => {
    const [s] = await tx.select().from(cashSessions).where(eq(cashSessions.id, id)).for("update");
    if (!s) throw new NotFoundError("Session de caisse");
    const own = s.openedBy === ctx.userId;
    if (own) ctxAssert(ctx, "sales.create");
    else if (!seesAll(ctx)) throw new NotFoundError("Session de caisse");
    if (s.status !== "open") throw new BusinessError("Cette session est déjà clôturée");
    const summary = await computeSessionSummary(tx, id, decimals);
    const expectedCash = round(s.openingFloat + summary.cashIn, decimals);
    const countedCash = round(input.countedCash, decimals);
    const difference = round(countedCash - expectedCash, decimals);
    await tx
      .update(cashSessions)
      .set({ status: "closed", closedAt: sql`now()`, closedBy: ctx.userId, expectedCash, countedCash, difference, forced: !own, closingNotes: input.notes, summary })
      .where(eq(cashSessions.id, id));
    await audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: own ? "cash_session.closed" : "cash_session.force_closed",
      entityType: "cash_session",
      entityId: id,
      metadata: { expectedCash, countedCash, difference },
      ip: ctx.ip,
    });
    return { expectedCash, countedCash, difference, summary };
  });
}

export type SessionFilters = { status?: "open" | "closed"; from?: Date; to?: Date; userId?: string; registerId?: string; page?: number };

function sessionConds(ctx: AppContext, f: SessionFilters) {
  const conds: SQL[] = [];
  if (f.status) conds.push(eq(cashSessions.status, f.status));
  if (f.from) conds.push(gte(cashSessions.openedAt, f.from));
  if (f.to) conds.push(lt(cashSessions.openedAt, f.to));
  if (f.registerId) conds.push(eq(cashSessions.registerId, f.registerId));
  // Sans « ventes de tous les vendeurs », chacun ne voit que ses propres sessions.
  const userId = seesAll(ctx) ? f.userId : ctx.userId;
  if (userId) conds.push(eq(cashSessions.openedBy, userId));
  return conds.length ? and(...conds) : undefined;
}

export async function listCashSessions(ctx: AppContext, f: SessionFilters = {}) {
  ctxAssert(ctx, "sales.view");
  const { limit, offset, page } = pageParams(f.page);
  return withTenant(ctx, async (tx) => {
    const where = sessionConds(ctx, f);
    const rows = await sessionQuery(tx).where(where).orderBy(desc(cashSessions.openedAt)).limit(limit).offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(cashSessions).where(where);
    return { rows, total: count, page, pageSize: limit };
  });
}

/* ───────────── Rapport par caissier et par caisse ───────────── */

export type CashierStats = {
  key: string | null;
  name: string | null;
  count: number;
  total: number;
  average: number;
  cancelledCount: number;
  cancelledTotal: number;
  discountTotal: number;
  creditCount: number;
  creditTotal: number;
};

/**
 * Ventes de caisse de la période, regroupées par caissier et par caisse : nombre, total, panier moyen,
 * annulations, remises accordées, ventes à crédit ; plus les sessions clôturées et leurs écarts.
 * Un utilisateur sans « ventes de tous les vendeurs » ne voit que ses propres chiffres.
 */
export async function cashierReport(ctx: AppContext, range: { from: Date; to: Date }, f: { userId?: string; registerId?: string } = {}) {
  ctxAssert(ctx, "sales.view");
  const decimals = currencyDecimals(ctx.company.currency);
  const userId = seesAll(ctx) ? f.userId : ctx.userId;
  return withTenant(ctx, async (tx) => {
    const filters = sql.join(
      [
        sql`x.created_at >= ${range.from}`,
        sql`x.created_at < ${range.to}`,
        ...(userId ? [sql`x.user_id = ${userId}`] : []),
        ...(f.registerId ? [sql`x.register_id = ${f.registerId}`] : []),
      ],
      sql` and `,
    );
    const base = sql`(select x.user_id, x.register_id, x.status, x.total, x.discount_total,
                             greatest(x.total - coalesce((select sum(p.amount) from payments p where p.sale_id = x.id and p.created_at = x.created_at), 0), 0) as credit
                        from sales x where ${filters})`;
    const metrics = sql`count(*) filter (where s.status = 'completed')::int as count,
             coalesce(sum(s.total) filter (where s.status = 'completed'), 0)::float8 as total,
             count(*) filter (where s.status = 'cancelled')::int as "cancelledCount",
             coalesce(sum(s.total) filter (where s.status = 'cancelled'), 0)::float8 as "cancelledTotal",
             coalesce(sum(s.discount_total) filter (where s.status = 'completed'), 0)::float8 as "discountTotal",
             count(*) filter (where s.status = 'completed' and s.credit > 0)::int as "creditCount",
             coalesce(sum(s.credit) filter (where s.status = 'completed'), 0)::float8 as "creditTotal"`;
    const finish = (rows: Omit<CashierStats, "average">[]): CashierStats[] =>
      rows.map((r) => ({
        ...r,
        total: round(r.total, decimals),
        cancelledTotal: round(r.cancelledTotal, decimals),
        discountTotal: round(r.discountTotal, decimals),
        creditTotal: round(r.creditTotal, decimals),
        average: r.count ? round(r.total / r.count, decimals) : 0,
      }));
    const byCashier = finish(
      (
        await tx.execute(sql`
          select s.user_id::text as key, u.full_name as name, ${metrics}
            from ${base} s left join users u on u.id = s.user_id
           group by s.user_id, u.full_name order by 4 desc`)
      ).rows as Omit<CashierStats, "average">[],
    );
    const byRegister = finish(
      (
        await tx.execute(sql`
          select s.register_id::text as key, r.name as name, ${metrics}
            from ${base} s left join registers r on r.id = s.register_id
           group by s.register_id, r.name, r.number order by r.number nulls last`)
      ).rows as Omit<CashierStats, "average">[],
    );
    const sessionWhere = sessionConds(ctx, { status: "closed", userId, registerId: f.registerId });
    const sessions = await sessionQuery(tx)
      .where(and(sessionWhere, gte(cashSessions.closedAt, range.from), lt(cashSessions.closedAt, range.to)))
      .orderBy(desc(cashSessions.closedAt))
      .limit(200);
    const differenceTotal = round(sessions.reduce((s, x) => s + (x.difference ?? 0), 0), decimals);
    return { byCashier, byRegister, sessions, differenceTotal };
  });
}

/** Caissiers de l'entreprise (pour les filtres) : visibles seulement par ceux qui voient toutes les ventes. */
export async function listSellers(ctx: AppContext) {
  if (!seesAll(ctx)) return [];
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: users.id, name: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, ctx.companyId))
      .orderBy(users.fullName),
  );
}
