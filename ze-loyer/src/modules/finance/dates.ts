/** Dates métier au format "AAAA-MM-JJ" (sans fuseau). Le Togo est en UTC+0 toute l'année. */
export type ISODate = string;

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function parseISO(d: ISODate) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, d: day };
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Premier jour du mois décalé de n mois */
export function addMonths(d: ISODate, n: number): ISODate {
  const { y, m } = parseISO(d);
  const idx = y * 12 + (m - 1) + n;
  return toISO(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export function startOfMonth(d: ISODate): ISODate {
  const { y, m } = parseISO(d);
  return toISO(y, m, 1);
}

export function endOfMonth(d: ISODate): ISODate {
  const { y, m } = parseISO(d);
  return toISO(y, m, daysInMonth(y, m));
}

/** Jour donné du mois de `d`, borné à la fin du mois (ex. 31 → 30 en avril) */
export function dayOfMonth(d: ISODate, day: number): ISODate {
  const { y, m } = parseISO(d);
  return toISO(y, m, Math.min(Math.max(1, day), daysInMonth(y, m)));
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parseISO(d);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

/** Nombre de jours de a vers b (b - a) */
export function daysBetween(a: ISODate, b: ISODate) {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function todayISO(now = new Date()): ISODate {
  return now.toISOString().slice(0, 10);
}

export function isISODate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const { y, m, d } = parseISO(v);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** « octobre 2026 » */
export function monthLabel(d: ISODate) {
  const { y, m } = parseISO(d);
  return `${MONTHS[m - 1]} ${y}`;
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 05 octobre 2026 » */
export function longDate(d: ISODate) {
  const { y, m, d: day } = parseISO(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** « 05 octobre » */
export function dayMonth(d: ISODate) {
  const { m, d: day } = parseISO(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

/** « 05/10/2026 » */
export function shortDate(d: ISODate) {
  const { y, m, d: day } = parseISO(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
