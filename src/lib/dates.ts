import { cache } from "react";

/**
 * Heure locale de l'entreprise : le serveur tourne en UTC, mais chaque entreprise vit dans son
 * fuseau (choisi avec son pays). Les dates affichées, « aujourd'hui » et les bornes des rapports
 * suivent ce fuseau.
 */
const tzSlot = cache(() => ({ tz: undefined as string | undefined }));

/** Fixe le fuseau de la requête en cours (appelé avec le contexte de l'entreprise). */
export function setRequestTimeZone(tz: string | null | undefined) {
  tzSlot().tz = tz ?? undefined;
}

export function requestTimeZone() {
  return tzSlot().tz;
}

function parts(d: Date, tz?: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) };
}

/** Écart (ms) entre l'heure du fuseau et UTC à cet instant. */
function offset(d: Date, tz?: string) {
  const p = parts(d, tz);
  return Date.UTC(p.y, p.m, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Instant correspondant à minuit (jour y-m-d, mois 0-11, débordements acceptés) dans le fuseau. */
export function zonedMidnight(y: number, m: number, d: number, tz?: string) {
  const guess = Date.UTC(y, m, d);
  const first = guess - offset(new Date(guess), tz);
  return new Date(guess - offset(new Date(first), tz));
}

/** Jour du calendrier (année, mois 0-11, jour, jour de semaine lundi = 0) à cet instant dans le fuseau. */
export function zonedDay(d: Date, tz?: string) {
  const p = parts(d, tz);
  return { y: p.y, m: p.m, d: p.d, dow: p.dow };
}

/** Date au format YYYY-MM-DD dans le fuseau de l'entreprise (par défaut celui de la requête). */
export function localDate(d: Date, tz: string | undefined = requestTimeZone()) {
  const p = zonedDay(d, tz);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.m + 1)}-${z(p.d)}`;
}

export function formatDate(d: Date | string, withTime = false) {
  // Une date seule (YYYY-MM-DD) n'a pas d'heure : pas de conversion de fuseau
  if (typeof d === "string" && d.length === 10) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", { ...(withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }), timeZone: requestTimeZone() } as Intl.DateTimeFormatOptions).format(date);
}
