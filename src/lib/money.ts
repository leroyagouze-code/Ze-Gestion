const ZERO_DECIMAL = new Set(["XOF", "XAF", "GNF", "JPY", "KMF", "RWF", "UGX"]);

export function currencyDecimals(currency: string) {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  try {
    // décimales usuelles de la devise (ex. 0 pour KRW ou VND, 3 pour TND ou KWD)
    return Math.min(new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits ?? 2, 2);
  } catch {
    return 2;
  }
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
/** Remise de ligne effective : jamais négative, jamais supérieure au montant de la ligne. */
export function lineDiscount(l: LineInput) {
  return Math.min(Math.max(l.discount ?? 0, 0), Math.max(l.quantity * l.unitPrice, 0));
}

export function computeLine(l: LineInput, decimals = 2): LineTotals {
  const gross = l.quantity * l.unitPrice - lineDiscount(l);
  const lineTotal = round(Math.max(gross, 0), decimals);
  const rate = l.taxRate ?? 0;
  const net = round(lineTotal / (1 + rate / 100), decimals);
  return { lineTotal, taxAmount: round(lineTotal - net, decimals), net };
}

/**
 * Deux façons de compter la TVA, au choix de l'entreprise (Paramètres) :
 * - "line" : prix saisis TTC, la TVA de chaque ligne est extraite du prix (usage caisse) ;
 * - "total" : prix saisis HT, la TVA est calculée une fois par taux sur le total HT (usage facture).
 * Dans les deux cas lineTotal reste le TTC de la ligne et taxAmount sa part de TVA
 * (en mode "total", la TVA de chaque taux est répartie sur ses lignes au centime près).
 */
export type TaxMode = "line" | "total";
export const TAX_MODES: Record<TaxMode, { label: string; hint: string }> = {
  line: { label: "Ligne par ligne (prix TTC)", hint: "Vous saisissez les prix TTC ; la TVA est déduite de chaque ligne. Pratique en boutique." },
  total: { label: "Sur le total HT (prix HT)", hint: "Vous saisissez les prix HT ; la TVA est calculée une fois sur le total HT de chaque taux." },
};
export const isTaxMode = (v: unknown): v is TaxMode => v === "line" || v === "total";

export function computeTotals(lines: LineInput[], globalDiscount = 0, decimals = 2, mode: TaxMode = "line") {
  if (mode === "total") return computeTotalsOnHt(lines, globalDiscount, decimals);
  const computed = lines.map((l) => computeLine(l, decimals));
  const lineSum = computed.reduce((s, c) => s + c.lineTotal, 0);
  const lineDiscounts = lines.reduce((s, l) => s + lineDiscount(l), 0);
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

function computeTotalsOnHt(lines: LineInput[], globalDiscount: number, decimals: number) {
  const ht = lines.map((l) => round(Math.max(l.quantity * l.unitPrice - lineDiscount(l), 0), decimals));
  const htSum = ht.reduce((s, v) => s + v, 0);
  const lineDiscounts = lines.reduce((s, l) => s + lineDiscount(l), 0);
  const discount = Math.min(Math.max(globalDiscount, 0), htSum);
  const ratio = htSum > 0 ? (htSum - discount) / htSum : 0;
  const subtotal = round(htSum - discount, decimals);
  const taxes = new Array<number>(lines.length).fill(0);
  let taxTotal = 0;
  for (const rate of new Set(lines.map((l) => l.taxRate ?? 0))) {
    const idx = lines.map((l, i) => ((l.taxRate ?? 0) === rate ? i : -1)).filter((i) => i >= 0);
    const base = idx.reduce((s, i) => s + ht[i], 0);
    const tax = round(base * ratio * (rate / 100), decimals);
    taxTotal += tax;
    // répartition sur les lignes du taux, le reste d'arrondi sur la dernière
    let left = tax;
    idx.forEach((i, k) => {
      const part = k === idx.length - 1 ? round(left, decimals) : round(base > 0 ? (tax * ht[i]) / base : 0, decimals);
      taxes[i] = part;
      left -= part;
    });
  }
  taxTotal = round(taxTotal, decimals);
  return {
    lines: ht.map((v, i) => ({ lineTotal: round(v + taxes[i], decimals), taxAmount: taxes[i], net: v })),
    subtotal,
    taxTotal,
    discountTotal: round(lineDiscounts + discount, decimals),
    total: round(subtotal + taxTotal, decimals),
  };
}

/** Base des prix affichés sur un document : « HT » ou « TTC » selon son mode de TVA. */
export const priceBasis = (mode: string | null | undefined) => (mode === "total" ? "HT" : "TTC");

/** Montant d'une ligne tel qu'affiché : TTC en mode "line", HT en mode "total" (cohérent avec le prix unitaire). */
export const shownLineTotal = (it: { lineTotal: number; taxAmount: number }, mode: string | null | undefined) =>
  mode === "total" ? it.lineTotal - it.taxAmount : it.lineTotal;
