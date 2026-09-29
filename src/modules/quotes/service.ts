import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { customers, invoices, products, quoteItems, quotes, type CustomerSnapshot } from "@/db/schema";
import { assertOwned } from "@/db/owned";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { getCompany, newToken } from "@/lib/auth/session";
import { localDate } from "@/lib/dates";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { computeTotals, currencyDecimals, isTaxMode, type TaxMode } from "@/lib/money";
import { pageParams } from "@/lib/pagination";
import { contains } from "@/lib/search";
import { ctxAssert, type AppContext } from "@/modules/auth/context";
import { createManualInvoiceInTx } from "@/modules/invoices/service";
import { nextDocumentNumber } from "@/modules/settings/sequences";
import { addDays, QUOTE_VALIDITY_DAYS, quoteDisplayStatus, type QuoteDisplayStatus } from "./labels";

type Quote = typeof quotes.$inferSelect;

const today = (ctx: { company: { timezone: string } }) => localDate(new Date(), ctx.company.timezone);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function snapshot(c: typeof customers.$inferSelect | null | undefined): CustomerSnapshot | null {
  if (!c) return null;
  return { name: c.name, companyName: c.companyName, phone: c.phone, email: c.email, address: c.address, taxId: c.taxId };
}

export const quoteSchema = z.object({
  customerId: z.string().uuid().nullish(),
  customerName: z.string().trim().max(200).nullish(),
  /** Date de validité ; par défaut 30 jours après la date d'émission. */
  validUntil: day.nullish(),
  conditions: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  discount: z.number().min(0).default(0),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().nullish(),
        description: z.string().trim().min(1).max(300),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).default(0),
        taxRate: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1, "Au moins une ligne"),
});
export type QuoteInput = z.input<typeof quoteSchema>;

/** Contenu commun à la création et à la modification : client, lignes, totaux. */
async function prepare(tx: Tx, ctx: AppContext, input: z.output<typeof quoteSchema>, taxMode: TaxMode, issueDate: string) {
  const customer = input.customerId ? (await tx.select().from(customers).where(eq(customers.id, input.customerId)))[0] : null;
  if (input.customerId && !customer) throw new NotFoundError("Client");
  for (const i of input.items) await assertOwned(tx, products, i.productId, "Produit");
  const validUntil = input.validUntil ?? addDays(issueDate, QUOTE_VALIDITY_DAYS);
  if (validUntil < issueDate) throw new BusinessError("La date de validité doit suivre la date d'émission");
  const totals = computeTotals(input.items, input.discount, currencyDecimals(ctx.company.currency), taxMode);
  return {
    header: {
      customerId: customer?.id ?? null,
      customerSnapshot: snapshot(customer) ?? (input.customerName ? { name: input.customerName } : null),
      validUntil,
      subtotal: totals.subtotal,
      globalDiscount: input.discount,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      conditions: input.conditions ?? null,
      notes: input.notes ?? null,
    },
    lines: (quoteId: string) =>
      input.items.map((i, idx) => ({
        companyId: ctx.companyId,
        quoteId,
        position: idx,
        productId: i.productId ?? null,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        taxAmount: totals.lines[idx].taxAmount,
        lineTotal: totals.lines[idx].lineTotal,
      })),
  };
}

export async function createQuote(ctx: AppContext, raw: QuoteInput) {
  ctxAssert(ctx, "quotes.create");
  const input = quoteSchema.parse(raw);
  const taxMode: TaxMode = isTaxMode(ctx.company.taxMode) ? ctx.company.taxMode : "line";
  return withTenant(ctx, async (tx) => {
    const issueDate = today(ctx);
    const { header, lines } = await prepare(tx, ctx, input, taxMode, issueDate);
    const number = await nextDocumentNumber(tx, ctx.companyId, "quote");
    const [q] = await tx
      .insert(quotes)
      .values({ companyId: ctx.companyId, number, issueDate, status: "draft", taxMode, publicToken: newToken(24), createdBy: ctx.userId, ...header })
      .returning({ id: quotes.id });
    await tx.insert(quoteItems).values(lines(q.id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "quote.created", entityType: "quote", entityId: q.id, metadata: { number, total: header.total }, ip: ctx.ip });
    return q.id;
  });
}

function assertEditable(q: Quote) {
  if (q.status === "converted") throw new BusinessError("Proforma déjà convertie en facture : elle ne se modifie plus");
  if (q.status === "accepted") throw new BusinessError("Proforma acceptée : rouvrez-la avant de la modifier");
}

/**
 * Modification à la demande du client : même numéro. Si la proforma a déjà quitté le brouillon
 * (envoyée, refusée…), le numéro de révision augmente et s'affiche sur le PDF (« Révision 2 »).
 */
export async function updateQuote(ctx: AppContext, id: string, raw: QuoteInput) {
  ctxAssert(ctx, "quotes.create");
  const input = quoteSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!q) throw new NotFoundError("Proforma");
    assertEditable(q);
    const taxMode: TaxMode = isTaxMode(q.taxMode) ? q.taxMode : "line";
    const { header, lines } = await prepare(tx, ctx, input, taxMode, q.issueDate);
    const revision = q.status === "draft" ? q.revision : q.revision + 1;
    await tx.update(quotes).set({ ...header, revision, updatedAt: new Date() }).where(eq(quotes.id, id));
    await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    await tx.insert(quoteItems).values(lines(id));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "quote.updated", entityType: "quote", entityId: id, metadata: { number: q.number, revision, total: header.total }, ip: ctx.ip });
    return id;
  });
}

type Transition = "sent" | "accepted" | "refused" | "reopen";

/** Suivi de la proforma : envoyée, acceptée ou refusée par le client, ou rouverte (acceptée → envoyée). */
export async function setQuoteStatus(ctx: AppContext, id: string, to: Transition) {
  ctxAssert(ctx, "quotes.create");
  return withTenant(ctx, async (tx) => {
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!q) throw new NotFoundError("Proforma");
    if (q.status === "converted") throw new BusinessError("Proforma déjà convertie en facture");
    const shown = quoteDisplayStatus(q, today(ctx));
    const now = new Date();
    let patch: Partial<Quote>;
    if (to === "sent") {
      if (q.status === "accepted") throw new BusinessError("Proforma déjà acceptée");
      patch = { status: "sent", sentAt: now };
    } else if (to === "accepted") {
      if (q.status === "accepted") return;
      if (shown === "expired") throw new BusinessError("Proforma expirée : prolongez sa validité (Modifier) avant de l'accepter");
      patch = { status: "accepted", acceptedAt: now, sentAt: q.sentAt ?? now };
    } else if (to === "refused") {
      if (q.status === "accepted") throw new BusinessError("Proforma acceptée : rouvrez-la d'abord");
      patch = { status: "refused", refusedAt: now };
    } else {
      if (q.status !== "accepted") throw new BusinessError("Seule une proforma acceptée peut être rouverte");
      patch = { status: "sent", acceptedAt: null };
    }
    await tx.update(quotes).set({ ...patch, updatedAt: now }).where(eq(quotes.id, id));
    const action = to === "reopen" ? "quote.reopened" : `quote.${to}`;
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action, entityType: "quote", entityId: id, metadata: { number: q.number }, ip: ctx.ip });
  });
}

/**
 * Convertit une proforma acceptée (ou envoyée) en facture, via le service de facture manuelle :
 * numérotation, totaux, règles de stock et journal identiques à une facture saisie à la main.
 * Idempotent : la ligne est verrouillée, un second appel renvoie la facture déjà créée.
 */
export async function convertQuoteToInvoice(ctx: AppContext, id: string) {
  ctxAssert(ctx, "quotes.create");
  ctxAssert(ctx, "invoices.create");
  return withTenant(ctx, async (tx) => {
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!q) throw new NotFoundError("Proforma");
    if (q.status === "converted") {
      if (!q.convertedInvoiceId) throw new BusinessError("La facture issue de cette proforma n'existe plus");
      return q.convertedInvoiceId;
    }
    if (q.status !== "accepted" && q.status !== "sent") throw new BusinessError("Seule une proforma envoyée ou acceptée peut être convertie en facture");
    if (quoteDisplayStatus(q, today(ctx)) === "expired") throw new BusinessError("Proforma expirée : prolongez sa validité (Modifier) avant de la convertir");
    const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position));
    // Client supprimé depuis : la facture reprend le nom figé sur la proforma
    const customerId = q.customerId && (await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, q.customerId)))[0] ? q.customerId : null;
    const invoiceId = await createManualInvoiceInTx(
      tx,
      ctx,
      {
        customerId,
        customerName: customerId ? null : (q.customerSnapshot?.name ?? null),
        dueDate: null,
        paymentTerms: q.conditions,
        notes: [q.notes ?? ctx.company.invoiceNotes, `Selon proforma ${q.number}${q.revision > 1 ? ` (révision ${q.revision})` : ""}`].filter(Boolean).join("\n"),
        discount: q.globalDiscount,
        replacesId: null,
        items: items.map((i) => ({ productId: i.productId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, taxRate: i.taxRate })),
      },
      { taxMode: isTaxMode(q.taxMode) ? q.taxMode : "line", auditMeta: { quoteId: q.id, quoteNumber: q.number } },
    );
    const now = new Date();
    await tx
      .update(quotes)
      .set({ status: "converted", convertedInvoiceId: invoiceId, convertedAt: now, acceptedAt: q.acceptedAt ?? now, updatedAt: now })
      .where(eq(quotes.id, id));
    const [inv] = await tx.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, invoiceId));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "quote.converted", entityType: "quote", entityId: id, metadata: { number: q.number, invoiceId, invoiceNumber: inv?.number }, ip: ctx.ip });
    return invoiceId;
  });
}

export async function listQuotes(ctx: AppContext, opts: { page?: number; status?: string; q?: string }) {
  ctxAssert(ctx, "quotes.view");
  const { limit, offset, page } = pageParams(opts.page);
  const t = today(ctx);
  return withTenant(ctx, async (tx) => {
    const conds = [];
    const open = inArray(quotes.status, ["draft", "sent"]);
    if (opts.status === "expired") conds.push(and(open, sql`${quotes.validUntil} < ${t}`));
    else if (opts.status === "draft" || opts.status === "sent") conds.push(and(eq(quotes.status, opts.status), sql`${quotes.validUntil} >= ${t}`));
    else if (opts.status === "accepted" || opts.status === "refused" || opts.status === "converted") conds.push(eq(quotes.status, opts.status));
    if (opts.q) conds.push(sql`(${quotes.number} ilike ${contains(opts.q)} or ${quotes.customerSnapshot}->>'name' ilike ${contains(opts.q)})`);
    const where = conds.length ? and(...conds) : undefined;
    const rows = await tx
      .select({
        id: quotes.id,
        number: quotes.number,
        revision: quotes.revision,
        issueDate: quotes.issueDate,
        validUntil: quotes.validUntil,
        total: quotes.total,
        status: quotes.status,
        customer: quotes.customerSnapshot,
      })
      .from(quotes)
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(quotes).where(where);
    return { rows: rows.map((r) => ({ ...r, displayStatus: quoteDisplayStatus(r, t) })), total: count, page, pageSize: limit };
  });
}

async function loadQuote(tx: Tx, id: string) {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) throw new NotFoundError("Proforma");
  const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position));
  const invoiceNumber = quote.convertedInvoiceId
    ? ((await tx.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, quote.convertedInvoiceId)))[0]?.number ?? null)
    : null;
  return { quote, items, invoiceNumber };
}

export async function getQuote(ctx: AppContext, id: string): Promise<Awaited<ReturnType<typeof loadQuote>> & { displayStatus: QuoteDisplayStatus }> {
  ctxAssert(ctx, "quotes.view");
  const data = await withTenant(ctx, (tx) => loadQuote(tx, id));
  return { ...data, displayStatus: quoteDisplayStatus(data.quote, today(ctx)) };
}

/** Proforma publique : le jeton (192 bits) identifie la proforma et, via une fonction SECURITY DEFINER, son entreprise. */
export async function getPublicQuote(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const res = await db.execute<{ company_id: string | null }>(sql`select public_quote_company(${token}) as company_id`);
  const companyId = res.rows[0]?.company_id;
  if (!companyId) return null;
  const company = await getCompany(companyId);
  if (!company || company.status !== "active") return null;
  const data = await withTenant({ companyId, userId: null }, async (tx) => {
    const [row] = await tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.publicToken, token));
    return row ? loadQuote(tx, row.id) : null;
  });
  if (!data) return null;
  return { ...data, company, displayStatus: quoteDisplayStatus(data.quote, localDate(new Date(), company.timezone)) };
}
