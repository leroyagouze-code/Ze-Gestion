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
  return `${n.replace(/ /g, " ")} ${symbol}`;
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value).replace(/ /g, " ");
}

export type LineInput = { quantity: number; unitPrice: number; discount?: number; taxRate?: number };
export type LineTotals = { lineTotal: number; taxAmount: number; net: number };

/** Remise de ligne effective : jamais négative, jamais supérieure au montant de la ligne. */
export function lineDiscount(l: LineInput) {
  return Math.min(Math.max(l.discount ?? 0, 0), Math.max(l.quantity * l.unitPrice, 0));
}

/**
 * Deux façons de compter la TVA, au choix de l'entreprise (Paramètres) :
 * - "line" : prix saisis TTC, la TVA de chaque ligne est extraite de son montant (usage caisse) ;
 * - "total" : prix saisis HT, la TVA est calculée une fois par taux sur le total HT (usage facture).
 * Dans les deux cas lineTotal est le TTC de la ligne (après toutes remises) et taxAmount sa part de TVA.
 */
export type TaxMode = "line" | "total";
export const TAX_MODES: Record<TaxMode, { label: string; hint: string }> = {
  line: { label: "Ligne par ligne (prix TTC)", hint: "Vous saisissez les prix TTC ; la TVA est déduite de chaque ligne. Pratique en boutique." },
  total: { label: "Sur le total HT (prix HT)", hint: "Vous saisissez les prix HT ; la TVA est calculée une fois sur le total HT de chaque taux." },
};
export const isTaxMode = (v: unknown): v is TaxMode => v === "line" || v === "total";

/**
 * Répartit `amount` entre des poids positifs, au prorata, sans perte d'arrondi (méthode du plus fort reste) :
 * la somme des parts vaut exactement `amount` au nombre de décimales de la devise.
 * À reste égal, la première ligne est servie d'abord (résultat stable).
 */
export function allocate(amount: number, weights: number[], decimals = 2): number[] {
  const f = 10 ** decimals;
  const units = Math.round(amount * f);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((s, x) => s + x, 0);
  if (!units || sum <= 0) return w.map(() => 0);
  const raw = w.map((x) => (units * x) / sum);
  const parts = raw.map((x) => Math.floor(x + 1e-9));
  let left = units - parts.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, r: x - parts[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) parts[order[k].i] += 1;
  return parts.map((p) => p / f);
}

/** Une ligne du détail de la TVA : base HT et TVA d'un taux. */
export type VatRow = { rate: number; base: number; tax: number };
export type ComputedLine = LineTotals & {
  /** Montant de la ligne avant remise globale, dans la base des prix saisis (TTC en mode "line", HT en mode "total"). */
  gross: number;
  /** Part de la remise globale portée par la ligne (même base que gross). */
  globalDiscount: number;
};

/**
 * Totaux d'une vente ou d'une facture : seule fonction de calcul, utilisée par la caisse, les factures et les documents.
 * 1. montant de chaque ligne après sa propre remise ;
 * 2. la remise globale est répartie sur les lignes au prorata de leur montant (plus fort reste : la somme tombe juste) ;
 * 3. la TVA porte sur ces montants remisés : extraite ligne par ligne en mode "line",
 *    calculée une fois par taux puis répartie sur les lignes du taux en mode "total".
 * Chaque ligne renvoie lineTotal = TTC après toutes remises, taxAmount = sa TVA, net = sa base HT, de sorte que
 * Σ net = subtotal, Σ taxAmount = taxTotal, Σ lineTotal = total ; `vat` donne le détail par taux.
 */
export function computeTotals(lines: LineInput[], globalDiscount = 0, decimals = 2, mode: TaxMode = "line") {
  const gross = lines.map((l) => round(Math.max(l.quantity * l.unitPrice - lineDiscount(l), 0), decimals));
  const grossSum = round(gross.reduce((s, v) => s + v, 0), decimals);
  const lineDiscounts = lines.reduce((s, l) => s + lineDiscount(l), 0);
  const discount = round(Math.min(Math.max(globalDiscount, 0), grossSum), decimals);
  const shares = allocate(discount, gross, decimals);
  // montant remisé de chaque ligne, dans la base des prix saisis (TTC ou HT)
  const after = gross.map((g, i) => round(g - shares[i], decimals));
  const rateOf = (i: number) => lines[i].taxRate ?? 0;

  const taxes = after.map((amount, i) =>
    mode === "line" ? round(amount - round(amount / (1 + rateOf(i) / 100), decimals), decimals) : 0,
  );
  const rates = [...new Set(lines.map((_, i) => rateOf(i)))].sort((a, b) => a - b);
  const vat: VatRow[] = rates.map((rate) => {
    const idx = lines.map((_, i) => i).filter((i) => rateOf(i) === rate);
    const amount = round(idx.reduce((s, i) => s + after[i], 0), decimals);
    if (mode === "total") {
      const tax = round(amount * (rate / 100), decimals);
      const parts = allocate(tax, idx.map((i) => after[i]), decimals);
      idx.forEach((i, k) => (taxes[i] = parts[k]));
      return { rate, base: amount, tax };
    }
    const tax = round(idx.reduce((s, i) => s + taxes[i], 0), decimals);
    return { rate, base: round(amount - tax, decimals), tax };
  });

  const computed: ComputedLine[] = lines.map((_, i) => {
    const net = mode === "total" ? after[i] : round(after[i] - taxes[i], decimals);
    return { lineTotal: round(net + taxes[i], decimals), taxAmount: taxes[i], net, gross: gross[i], globalDiscount: shares[i] };
  });
  const subtotal = round(vat.reduce((s, v) => s + v.base, 0), decimals);
  const taxTotal = round(vat.reduce((s, v) => s + v.tax, 0), decimals);
  return {
    lines: computed,
    vat,
    subtotal,
    taxTotal,
    discountTotal: round(lineDiscounts + discount, decimals),
    total: round(subtotal + taxTotal, decimals),
  };
}

/** Ligne d'un document enregistré (vente ou facture). */
type StoredLine = { taxRate: number; taxAmount: number; lineTotal: number };

/**
 * Détail de la TVA par taux d'un document enregistré, lu dans ses lignes (jamais recalculé : le document fait foi).
 * Les lignes enregistrées par computeTotals vérifient Σ lineTotal = total et Σ taxAmount = taxTotal.
 * Les documents antérieurs à la répartition de la remise globale et portant une telle remise ne les vérifient pas :
 * on renvoie alors null plutôt qu'un détail faux, et le document garde son affichage d'origine (TVA totale seule).
 */
export function storedVatBreakdown(items: StoredLine[], doc: { total: number; taxTotal: number }, decimals = 2): VatRow[] | null {
  const eps = 0.5 / 10 ** decimals;
  if (Math.abs(items.reduce((s, it) => s + it.lineTotal, 0) - doc.total) > eps) return null;
  if (Math.abs(items.reduce((s, it) => s + it.taxAmount, 0) - doc.taxTotal) > eps) return null;
  const byRate = new Map<number, VatRow>();
  for (const it of items) {
    const r = byRate.get(it.taxRate) ?? { rate: it.taxRate, base: 0, tax: 0 };
    r.base = round(r.base + it.lineTotal - it.taxAmount, decimals);
    r.tax = round(r.tax + it.taxAmount, decimals);
    byRate.set(it.taxRate, r);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

/** Détail de la TVA par taux à afficher sous la TVA totale : seulement quand le document mélange plusieurs taux. */
export function vatDetail(items: StoredLine[], doc: { total: number; taxTotal: number }, currency: string): VatRow[] {
  const rows = storedVatBreakdown(items, doc, currencyDecimals(currency));
  return rows && rows.length > 1 ? rows : [];
}

/** Base des prix affichés sur un document : « HT » ou « TTC » selon son mode de TVA. */
export const priceBasis = (mode: string | null | undefined) => (mode === "total" ? "HT" : "TTC");

/**
 * Montant d'une ligne tel qu'affiché : quantité × prix unitaire − remise de ligne, avant remise globale
 * (TTC en mode "line", HT en mode "total", cohérent avec le prix unitaire) ; la remise globale figure dans les totaux.
 * Donne le même résultat pour les documents anciens et récents.
 */
export const shownLineTotal = (it: { quantity: number; unitPrice: number; discount?: number | null }) =>
  Math.max(it.quantity * it.unitPrice - Math.max(it.discount ?? 0, 0), 0);
