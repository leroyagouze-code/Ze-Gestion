import os from "node:os";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, subscriptions } from "@/db/schema";

/**
 * Côté logiciel Windows : prévient le serveur en ligne que ce poste existe, au démarrage puis
 * chaque jour. Silencieux en cas d'échec (hors ligne, serveur pas encore configuré).
 */
const DAY = 86_400_000;

async function reportOnce(serverUrl: string) {
  const [c] = await db
    .select({ name: companies.name, country: companies.country, locale: companies.locale, timezone: companies.timezone, licenseCode: subscriptions.licenseCode })
    .from(companies)
    .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
    .orderBy(asc(companies.createdAt))
    .limit(1);
  const body = {
    installId: process.env.ZE_INSTALL_ID,
    edition: "desktop",
    version: process.env.ZE_APP_VERSION ?? null,
    os: `${os.type()} ${os.release()}`.slice(0, 60),
    locale: c?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: c?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    country: c?.country ?? null,
    companyName: c?.name ?? null,
    licensed: !!c?.licenseCode,
  };
  await fetch(new URL("/api/installs", serverUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

export function startInstallReporting() {
  const serverUrl = process.env.ZE_SERVER_URL;
  if (!serverUrl || !process.env.ZE_INSTALL_ID) return;
  const run = () => reportOnce(serverUrl).catch(() => undefined);
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY).unref();
}
