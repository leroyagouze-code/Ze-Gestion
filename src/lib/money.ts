const ZERO_DECIMAL = new Set(["XOF", "XAF", "GNF", "JPY", "KMF", "RWF", "UGX"]);

export function currencyDecimals(currency: string) {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** Arrondi monétaire (half-up) au nombre de décimales de la devise. */
export function round(value: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function formatMoney(value: number, currency = "XOF", locale = "fr-FR") {
  const d = currencyDecimals(currency);
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  const symbol = currency === "XOF" || currency === "XAF" ? "FCFA" : currency;
  return `${n.replace(/ /g, " ")} ${symbol}`;
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value).replace(/ /g, " ");
}

export type LineInput = { quantity: number; unitPrice: number; discount?: number; taxRate?: number };
export type LineTotals = { lineTotal: number; taxAmount: number; net: number };

/**
 * Prix saisis TTC (usage caisse). Calcule le TTC de la ligne, la part de taxe et le HT.
 */
export function computeLine(l: LineInput, decimals = 2): LineTotals {
  const gross = l.quantity * l.unitPrice - (l.discount ?? 0);
  const lineTotal = round(Math.max(gross, 0), decimals);
  const rate = l.taxRate ?? 0;
  const net = round(lineTotal / (1 + rate / 100), decimals);
  return { lineTotal, taxAmount: round(lineTotal - net, decimals), net };
}

export function computeTotals(lines: LineInput[], globalDiscount = 0, decimals = 2) {
  const computed = lines.map((l) => computeLine(l, decimals));
  const lineSum = computed.reduce((s, c) => s + c.lineTotal, 0);
  const lineDiscounts = lines.reduce((s, l) => s + (l.discount ?? 0), 0);
  const discount = Math.min(Math.max(globalDiscount, 0), lineSum);
  // la remise globale est répartie proportionnellement pour garder une TVA juste
  const ratio = lineSum > 0 ? (lineSum - discount) / lineSum : 0;
  const total = round(lineSum - discount, decimals);
  const taxTotal = round(computed.reduce((s, c) => s + c.taxAmount * ratio, 0), decimals);
  return {
    lines: computed,
    subtotal: round(total - taxTotal, decimals),
    taxTotal,
    discountTotal: round(lineDiscounts + discount, decimals),
    total,
  };
}
