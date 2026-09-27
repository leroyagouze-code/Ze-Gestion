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
  return applyLicense(ctx, code);
}

async function applyLicense(ctx: { companyId: string; userId: string | null; ip?: string | null }, code: string) {
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
  await withTenant({ companyId: ctx.companyId, userId: ctx.userId }, (tx) =>
    audit(tx, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: "license.activate",
      entityType: "company",
      entityId: ctx.companyId,
      metadata: { plan: license.plan, expiresAt: license.expiresAt?.toISOString() ?? null, auto: ctx.userId === null },
      ip: ctx.ip ?? null,
    }),
  );
  return license;
}

/** Adresse du serveur en ligne de ZE GROUP (vide tant qu'il n'est pas configuré). */
export const serverUrl = () => process.env.ZE_SERVER_URL?.replace(/\/+$/, "") ?? "";

/**
 * Demande au serveur en ligne la licence achetée pour ce poste et l'active si elle est nouvelle.
 * Renvoie "none" si rien n'a été acheté, "same" si elle est déjà active, sinon la licence activée.
 */
export async function fetchLicenseFromServer(companyId: string, userId: string | null) {
  const base = serverUrl();
  const id = installId();
  if (!base || !id) throw new BusinessError("Le serveur de ZE GROUP n'est pas configuré dans ce logiciel");
  let body: { license?: { code: string } | null };
  try {
    const res = await fetch(`${base}/api/licences/poste/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return "none" as const;
    if (!res.ok) throw new Error(String(res.status));
    body = await res.json();
  } catch {
    throw new BusinessError("Impossible de joindre le serveur de ZE GROUP. Vérifiez la connexion internet et réessayez.");
  }
  if (!body.license?.code) return "none" as const;
  const [current] = await db.select({ code: subscriptions.licenseCode }).from(subscriptions).where(eq(subscriptions.companyId, companyId));
  if (current?.code === normalizeCode(body.license.code)) return "same" as const;
  return applyLicense({ companyId, userId }, body.license.code);
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
