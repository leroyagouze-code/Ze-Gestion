import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appInstalls } from "@/db/schema";
import { BusinessError } from "@/lib/errors";

/**
 * Suivi des installations : chaque logiciel Windows signale au serveur en ligne qu'il existe
 * (une fois au démarrage puis une fois par jour). Aucune donnée de vente, de client ou de stock :
 * seulement le code d'installation, la version, le système, la langue, le fuseau, le pays,
 * le nom et le métier de l'entreprise, et si une licence est active.
 */

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const installReportSchema = z.object({
  installId: z.string().trim().regex(/^[0-9A-Z]{4}-?[0-9A-Z]{4}$/i, "Code d'installation invalide"),
  edition: z.enum(["desktop", "web"]).default("desktop"),
  version: text(20),
  os: text(60),
  locale: text(20),
  timezone: text(60),
  country: z.string().trim().length(2).optional().nullable().transform((v) => v?.toUpperCase() || null),
  companyName: text(120),
  businessType: text(30),
  licensed: z.boolean().optional().default(false),
});

/** Enregistre ou met à jour une installation (appelé par POST /api/installs). */
export async function recordInstall(raw: unknown, ipCountry?: string | null) {
  const parsed = installReportSchema.safeParse(raw);
  if (!parsed.success) throw new BusinessError("Signalement invalide");
  const r = parsed.data;
  const installId = r.installId.toUpperCase().replace("-", "").replace(/^(.{4})/, "$1-");
  const values = { ...r, installId, country: ipCountry && /^[A-Z]{2}$/.test(ipCountry) ? ipCountry : r.country };
  await db
    .insert(appInstalls)
    .values(values)
    .onConflictDoUpdate({
      target: appInstalls.installId,
      set: {
        edition: values.edition,
        version: values.version,
        os: values.os,
        locale: values.locale,
        timezone: values.timezone,
        country: sql`coalesce(${values.country}, ${appInstalls.country})`,
        companyName: sql`coalesce(${values.companyName}, ${appInstalls.companyName})`,
        businessType: sql`coalesce(${values.businessType}, ${appInstalls.businessType})`,
        licensed: values.licensed,
        pings: sql`${appInstalls.pings} + 1`,
        lastSeenAt: new Date(),
      },
    });
}

export async function listInstalls(limit = 500) {
  const rows = await db.select().from(appInstalls).orderBy(desc(appInstalls.firstSeenAt)).limit(limit);
  const byCountry = new Map<string, number>();
  for (const r of rows) byCountry.set(r.country ?? "??", (byCountry.get(r.country ?? "??") ?? 0) + 1);
  const since = (days: number) => rows.filter((r) => r.lastSeenAt.getTime() > Date.now() - days * 86_400_000).length;
  return {
    rows,
    total: rows.length,
    active7: since(7),
    active30: since(30),
    licensed: rows.filter((r) => r.licensed).length,
    byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]),
  };
}
