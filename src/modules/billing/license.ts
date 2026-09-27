import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { withTenant } from "@/db/tenant";
import { licenseIssues, plans, subscriptions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { createLicense, isDesktop, LICENSE_PLANS, normalizeCode, verifyLicense, type LicensePlan } from "@/lib/license";
import type { AppContext } from "@/modules/auth/context";

/* ─────────── Logiciel de bureau : activation sur le poste ─────────── */

export const installId = () => process.env.ZE_INSTALL_ID ?? "";

/**
 * Enregistre un code de licence reçu de ZE GROUP. Réservé à l'administrateur de l'entreprise,
 * y compris en lecture seule (c'est justement ce qui la lève).
 */
export async function activateLicense(ctx: Pick<AppContext, "companyId" | "userId" | "isAdmin" | "ip">, code: string) {
  if (!isDesktop()) throw new BusinessError("La licence ne concerne que le logiciel installé sur ordinateur");
  if (!ctx.isAdmin) throw new BusinessError("Seul l'administrateur peut activer la licence");
  const license = verifyLicense(code, installId());
  if (!license) throw new BusinessError("Code invalide pour cet ordinateur. Vérifiez la saisie ou le code d'installation communiqué.");
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) throw new BusinessError("Ce code a déjà expiré. Demandez un nouveau code.");
  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, license.plan)).limit(1);
  await db
    .update(subscriptions)
    .set({
      licenseCode: normalizeCode(code),
      status: "active",
      currentPeriodEnd: license.expiresAt,
      unlimited: license.expiresAt === null,
      ...(plan ? { planId: plan.id } : {}),
    })
    .where(eq(subscriptions.companyId, ctx.companyId));
  await withTenant(ctx, (tx) =>
    audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "license.activate",
      entityType: "company",
      entityId: ctx.companyId,
      metadata: { plan: license.plan, expiresAt: license.expiresAt?.toISOString() ?? null },
      ip: ctx.ip,
    }),
  );
  return license;
}

/* ─────────── Serveur en ligne : fabrication des codes par le super admin ─────────── */

export const LICENSE_DURATIONS = { "1": "1 mois", "3": "3 mois", "6": "6 mois", "12": "1 an", life: "À vie" } as const;

export const licenseRequestSchema = z.object({
  installId: z.string().trim().min(1, "Code d'installation requis"),
  plan: z.enum(Object.values(LICENSE_PLANS) as [LicensePlan, ...LicensePlan[]]),
  duration: z.enum(Object.keys(LICENSE_DURATIONS) as [keyof typeof LICENSE_DURATIONS, ...(keyof typeof LICENSE_DURATIONS)[]]),
  customer: z.string().trim().max(120).optional().transform((v) => v || null),
});

export const canIssueLicenses = () => !!process.env.LICENSE_PRIVATE_KEY;

export function licenseEnd(duration: keyof typeof LICENSE_DURATIONS, from = new Date()) {
  if (duration === "life") return null;
  const end = new Date(from);
  end.setMonth(end.getMonth() + Number(duration));
  return end;
}

export async function issueLicense(admin: { userId: string; isSuperAdmin: boolean }, raw: unknown) {
  if (!admin.isSuperAdmin) throw new BusinessError("Accès réservé à l'administrateur de la plateforme");
  const key = process.env.LICENSE_PRIVATE_KEY;
  if (!key) throw new BusinessError("La clé privée des licences (LICENSE_PRIVATE_KEY) n'est pas configurée sur ce serveur");
  const input = licenseRequestSchema.parse(raw);
  const expiresAt = licenseEnd(input.duration);
  let code: string;
  try {
    code = createLicense(key, input.installId, input.plan, expiresAt);
  } catch (e) {
    throw new BusinessError(e instanceof Error ? e.message : "Code impossible à générer");
  }
  const id = normalizeCode(input.installId);
  const [row] = await db
    .insert(licenseIssues)
    .values({ installId: `${id.slice(0, 4)}-${id.slice(4)}`, plan: input.plan, expiresAt, customer: input.customer, code, createdBy: admin.userId })
    .returning();
  return row;
}

export async function listLicenseIssues(limit = 50) {
  return db
    .select({ issue: licenseIssues, createdBy: users.fullName })
    .from(licenseIssues)
    .leftJoin(users, eq(users.id, licenseIssues.createdBy))
    .orderBy(desc(licenseIssues.createdAt))
    .limit(limit);
}
