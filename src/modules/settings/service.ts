import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, documentSequences, paymentMethods, stores, taxes } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "@/lib/audit";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { optText } from "@/lib/zod";
import { ctxAssert, type AppContext } from "@/modules/auth/context";

export const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: optText(40),
  whatsapp: optText(40),
  address: optText(300),
  city: optText(100),
  country: z.string().trim().length(2),
  currency: z.string().trim().length(3),
  taxId: optText(100),
  billingAddress: optText(300),
  extraInfo: optText(1000),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
  bankInfo: optText(1000),
  invoiceNotes: optText(1000),
  invoiceFooter: optText(1000),
  invoiceFormat: z.enum(["A4", "A5"]),
  receiptFormat: z.enum(["58mm", "80mm", "A4"]),
});

export async function updateCompany(ctx: AppContext, raw: z.input<typeof companySchema>, logoUrl?: string) {
  ctxAssert(ctx, "settings.manage");
  const input = companySchema.parse(raw);
  await db
    .update(companies)
    .set({ ...input, ...(logoUrl ? { logoUrl } : {}), updatedAt: new Date() })
    .where(eq(companies.id, ctx.companyId));
  await withTenant(ctx, (tx) =>
    audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "company.updated", entityType: "company", entityId: ctx.companyId, ip: ctx.ip }),
  );
}

export async function getSettings(ctx: AppContext) {
  ctxAssert(ctx, "settings.manage");
  return withTenant(ctx, async (tx) => ({
    taxes: await tx.select().from(taxes).orderBy(taxes.rate),
    paymentMethods: await tx.select().from(paymentMethods).orderBy(paymentMethods.sortOrder),
    sequences: await tx.select().from(documentSequences).orderBy(documentSequences.docType),
    stores: await tx.select().from(stores).orderBy(stores.name),
  }));
}

export const taxSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rate: z.coerce.number().min(0).max(100),
  isDefault: z.coerce.boolean().default(false),
});

export async function saveTax(ctx: AppContext, id: string | null, raw: z.input<typeof taxSchema>) {
  ctxAssert(ctx, "settings.manage");
  const input = taxSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    if (input.isDefault) await tx.update(taxes).set({ isDefault: false }).where(eq(taxes.companyId, ctx.companyId));
    if (id) await tx.update(taxes).set(input).where(eq(taxes.id, id));
    else await tx.insert(taxes).values({ companyId: ctx.companyId, ...input });
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: id ? "tax.updated" : "tax.created", metadata: input, ip: ctx.ip });
  });
}

export async function togglePaymentMethod(ctx: AppContext, id: string, enabled: boolean) {
  ctxAssert(ctx, "settings.manage");
  return withTenant(ctx, async (tx) => {
    const res = await tx.update(paymentMethods).set({ isEnabled: enabled }).where(eq(paymentMethods.id, id)).returning({ label: paymentMethods.label });
    if (!res.length) throw new NotFoundError("Moyen de paiement");
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "payment_method.updated", metadata: { label: res[0].label, enabled }, ip: ctx.ip });
  });
}

export async function addPaymentMethod(ctx: AppContext, label: string, type: (typeof paymentMethods.$inferInsert)["type"]) {
  ctxAssert(ctx, "settings.manage");
  const clean = label.trim();
  if (!clean) throw new BusinessError("Libellé requis");
  const code = clean.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").slice(0, 30) || "moyen";
  return withTenant(ctx, async (tx) => {
    await tx.insert(paymentMethods).values({ companyId: ctx.companyId, code: `${code}_${Date.now().toString(36)}`, label: clean, type, sortOrder: 100 });
  });
}

export const sequenceSchema = z.object({
  docType: z.string(),
  prefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres ou tirets"),
  pattern: z.string().trim().min(5).max(50).refine((p) => p.includes("{SEQ}"), "Le motif doit contenir {SEQ}"),
  padding: z.coerce.number().int().min(1).max(10),
  resetYearly: z.coerce.boolean(),
});

export async function updateSequence(ctx: AppContext, raw: z.input<typeof sequenceSchema>) {
  ctxAssert(ctx, "settings.manage");
  const input = sequenceSchema.parse(raw);
  return withTenant(ctx, async (tx) => {
    await tx
      .update(documentSequences)
      .set({ prefix: input.prefix, pattern: input.pattern, padding: input.padding, resetYearly: input.resetYearly })
      .where(and(eq(documentSequences.companyId, ctx.companyId), eq(documentSequences.docType, input.docType)));
    await audit(tx, { companyId: ctx.companyId, userId: ctx.userId, action: "numbering.updated", metadata: input, ip: ctx.ip });
  });
}
