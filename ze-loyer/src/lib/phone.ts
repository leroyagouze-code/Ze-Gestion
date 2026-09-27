/**
 * Normalise un numéro togolais : « 90 00 00 01 », « 0022890000001 », « +228 90000001 » → « +22890000001 ».
 * Les numéros internationaux (+XXX…) sont conservés.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s.\-()]/g, "");
  if (!raw) return null;
  let digits = raw;
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (/^\d{8}$/.test(digits)) return `+228${digits}`;
  if (/^228\d{8}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

/** « +228 90 00 00 01 » */
export function formatPhone(p: string) {
  const m = /^\+228(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(p);
  return m ? `+228 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
