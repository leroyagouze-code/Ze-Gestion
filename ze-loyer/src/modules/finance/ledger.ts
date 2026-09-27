/*
 * Règles financières de ZE LOYER — fonctions pures, sans base de données.
 *
 * Le solde n'est jamais stocké : il est recalculé à partir des opérations.
 *   - Loyers appelés (une ligne par période)            → dette du locataire
 *   - Paiements LOYER / AVANCE, AJUSTEMENT positif      → crédit du locataire
 *   - REMBOURSEMENT (argent rendu), AJUSTEMENT négatif  → consomment le crédit
 *   - CAUTION, CHARGE, FRAIS, AUTRE                     → hors loyer (suivis à part)
 *
 * Répartition : chaque crédit est affecté aux loyers les plus anciens d'abord (FIFO).
 * Le crédit restant couvre les périodes futures (paiement d'avance).
 */
import { addMonths, dayOfMonth, daysBetween, endOfMonth, type ISODate } from "./dates";

export type Periodicity = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY";
export type TransactionType = "LOYER" | "AVANCE" | "CAUTION" | "CHARGE" | "FRAIS" | "REMBOURSEMENT" | "AJUSTEMENT" | "AUTRE";

export const PERIOD_MONTHS: Record<Periodicity, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, YEARLY: 12 };

export type LeaseTerms = {
  startDate: ISODate;
  endDate: ISODate | null;
  rentAmount: number;
  periodicity: Periodicity;
  dueDay: number;
};

export type Period = {
  index: number;
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
  amount: number;
};

/** Période n° `index` d'un bail (périodes calées sur les mois calendaires, à partir du mois de début). */
export function periodAt(terms: LeaseTerms, index: number): Period {
  const step = PERIOD_MONTHS[terms.periodicity];
  const periodStart = addMonths(terms.startDate, index * step);
  const periodEnd = endOfMonth(addMonths(periodStart, step - 1));
  let dueDate = dayOfMonth(periodStart, terms.dueDay);
  // Première échéance : jamais avant l'entrée dans les lieux
  if (index === 0 && dueDate < terms.startDate) dueDate = terms.startDate;
  return { index, periodStart, periodEnd, dueDate, amount: terms.rentAmount };
}

/** Périodes ayant commencé au plus tard le `until` (et avant la fin du bail). */
export function scheduleUntil(terms: LeaseTerms, until: ISODate): Period[] {
  const out: Period[] = [];
  for (let i = 0; i < 1200; i++) {
    const p = periodAt(terms, i);
    if (p.periodStart > until) break;
    if (terms.endDate && p.periodStart > terms.endDate) break;
    out.push(p);
  }
  return out;
}

/** Signe d'une opération sur le compte loyer : +1 crédit, -1 débit, 0 hors loyer. */
export function rentEffect(type: TransactionType, amount: number): { credit: number; debit: number } {
  switch (type) {
    case "LOYER":
    case "AVANCE":
      return { credit: amount, debit: 0 };
    case "AJUSTEMENT":
      return amount >= 0 ? { credit: amount, debit: 0 } : { credit: 0, debit: -amount };
    case "REMBOURSEMENT":
      return { credit: 0, debit: amount };
    default:
      return { credit: 0, debit: 0 };
  }
}

export type LedgerCharge = { id: string; periodStart: ISODate; periodEnd: ISODate; dueDate: ISODate; amount: number };
export type LedgerTransaction = { id: string; type: TransactionType; amount: number; date: ISODate; createdAt?: number };

export type LineStatus = "PAID" | "PARTIAL" | "DUE" | "LATE";

export type LedgerLine = {
  key: string;
  kind: "CHARGE" | "PROJECTED" | "DEBIT";
  chargeId: string | null;
  transactionId: string | null;
  periodStart: ISODate | null;
  periodEnd: ISODate | null;
  dueDate: ISODate;
  amount: number;
  paid: number;
  remaining: number;
  status: LineStatus;
  overdue: boolean;
  /** Date du dernier crédit ayant contribué à cette ligne */
  paidOn: ISODate | null;
  allocations: { transactionId: string; amount: number }[];
};

export type Situation = {
  status: "A_JOUR" | "EN_RETARD" | "EN_AVANCE";
  totalCharged: number;
  totalCredited: number;
  /** > 0 : le locataire doit ; < 0 : il est en avance */
  balance: number;
  overdueAmount: number;
  /** Dû à ce jour + période en cours non réglée */
  amountDue: number;
  advance: number;
  /** Nombre de périodes futures entièrement couvertes par l'avance */
  periodsAhead: number;
  coveredUntil: ISODate | null;
  nextDue: { date: ISODate; amount: number } | null;
  oldestOverdue: ISODate | null;
  daysLate: number;
  lines: LedgerLine[];
};

type Credit = { id: string; date: ISODate; left: number };

function statusOf(amount: number, paid: number, dueDate: ISODate, today: ISODate): { status: LineStatus; overdue: boolean } {
  const remaining = amount - paid;
  if (remaining <= 0) return { status: "PAID", overdue: false };
  const overdue = dueDate < today;
  if (paid > 0) return { status: "PARTIAL", overdue };
  return { status: overdue ? "LATE" : "DUE", overdue };
}

/**
 * Calcule la situation d'un bail à la date `today`.
 * `charges` : loyers appelés (déjà matérialisés). Les périodes futures sont projetées si du crédit reste.
 */
export function computeLedger(input: {
  terms: LeaseTerms;
  charges: LedgerCharge[];
  transactions: LedgerTransaction[];
  today: ISODate;
  /** Nombre max. de périodes futures projetées (sécurité) */
  maxProjected?: number;
}): Situation {
  const { terms, today } = input;
  const txs = [...input.transactions].sort((a, b) => (a.date === b.date ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : a.date < b.date ? -1 : 1));

  const credits: Credit[] = [];
  type Debit = Omit<LedgerLine, "paid" | "remaining" | "status" | "overdue" | "paidOn" | "allocations">;
  const debits: Debit[] = input.charges.map((c) => ({
    key: `c:${c.id}`,
    kind: "CHARGE",
    chargeId: c.id,
    transactionId: null,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    dueDate: c.dueDate,
    amount: c.amount,
  }));
  for (const t of txs) {
    const e = rentEffect(t.type, t.amount);
    if (e.credit > 0) credits.push({ id: t.id, date: t.date, left: e.credit });
    if (e.debit > 0)
      debits.push({ key: `t:${t.id}`, kind: "DEBIT", chargeId: null, transactionId: t.id, periodStart: null, periodEnd: null, dueDate: t.date, amount: e.debit });
  }
  // Loyers avant débits ponctuels à date égale ; ordre stable sinon
  debits.sort((a, b) => (a.dueDate === b.dueDate ? (a.kind === "CHARGE" ? -1 : 1) - (b.kind === "CHARGE" ? -1 : 1) : a.dueDate < b.dueDate ? -1 : 1));

  const totalCharged = debits.reduce((s, d) => s + d.amount, 0);
  const totalCredited = credits.reduce((s, c) => s + c.left, 0);

  let ci = 0;
  const allocate = (d: Debit): LedgerLine => {
    let need = d.amount;
    const allocations: { transactionId: string; amount: number }[] = [];
    let paidOn: ISODate | null = null;
    while (need > 0 && ci < credits.length) {
      const c = credits[ci];
      const take = Math.min(need, c.left);
      if (take > 0) {
        allocations.push({ transactionId: c.id, amount: take });
        c.left -= take;
        need -= take;
        paidOn = c.date;
      }
      if (c.left === 0) ci++;
    }
    const paid = d.amount - need;
    return { ...d, paid, remaining: need, paidOn, allocations, ...statusOf(d.amount, paid, d.dueDate, today) };
  };

  const lines = debits.map(allocate);

  // Crédit restant → projection sur les périodes suivantes
  const lastIndex = input.charges.length
    ? Math.max(...input.charges.map((c) => indexOfPeriod(terms, c.periodStart)))
    : -1;
  let advance = credits.slice(ci).reduce((s, c) => s + c.left, 0);
  const advanceTotal = advance;
  let periodsAhead = 0;
  const max = input.maxProjected ?? 240;
  let nextIndex = lastIndex + 1;
  if (terms.rentAmount > 0) {
    for (let k = 0; advance > 0 && k < max; k++, nextIndex++) {
      const p = periodAt(terms, nextIndex);
      if (terms.endDate && p.periodStart > terms.endDate) break;
      const line = allocate({
        key: `p:${p.periodStart}`,
        kind: "PROJECTED",
        chargeId: null,
        transactionId: null,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        dueDate: p.dueDate,
        amount: p.amount,
      });
      lines.push(line);
      advance -= line.paid;
      if (line.remaining === 0) periodsAhead++;
    }
  }

  // Couvert jusqu'au : fin de la dernière période payée sans interruption depuis le début
  let coveredUntil: ISODate | null = null;
  for (const l of lines) {
    if (l.kind === "DEBIT") continue;
    if (l.remaining > 0) break;
    coveredUntil = l.periodEnd;
  }

  const real = lines.filter((l) => l.kind !== "PROJECTED");
  const overdueLines = real.filter((l) => l.overdue);
  const overdueAmount = overdueLines.reduce((s, l) => s + l.remaining, 0);
  const amountDue = real.reduce((s, l) => s + l.remaining, 0);
  const oldestOverdue = overdueLines.length ? overdueLines[0].dueDate : null;

  // Prochaine échéance : première ligne réelle non réglée à venir, sinon la période suivante non couverte
  let nextDue: Situation["nextDue"] = null;
  const upcoming = real.find((l) => l.remaining > 0 && !l.overdue);
  if (upcoming) nextDue = { date: upcoming.dueDate, amount: upcoming.remaining };
  else {
    const partialProjected = lines.find((l) => l.kind === "PROJECTED" && l.remaining > 0);
    const p = partialProjected ?? periodAt(terms, nextIndex);
    const ended = terms.endDate && (p.periodStart ?? "") > terms.endDate;
    if (!ended && terms.rentAmount > 0)
      nextDue = { date: p.dueDate, amount: partialProjected ? partialProjected.remaining : p.amount };
  }

  const status: Situation["status"] = overdueAmount > 0 ? "EN_RETARD" : advanceTotal > 0 ? "EN_AVANCE" : "A_JOUR";

  return {
    status,
    totalCharged,
    totalCredited,
    balance: totalCharged - totalCredited,
    overdueAmount,
    amountDue,
    advance: advanceTotal,
    periodsAhead,
    coveredUntil,
    nextDue,
    oldestOverdue,
    daysLate: oldestOverdue ? daysBetween(oldestOverdue, today) : 0,
    lines,
  };
}

/** Index de la période commençant à `periodStart` */
export function indexOfPeriod(terms: LeaseTerms, periodStart: ISODate) {
  const a = terms.startDate.slice(0, 7).split("-").map(Number);
  const b = periodStart.slice(0, 7).split("-").map(Number);
  const months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  return Math.floor(months / PERIOD_MONTHS[terms.periodicity]);
}

/** Nombre de périodes entièrement couvertes par un montant (ex. 450 000 / 75 000 = 6 mois). */
export function periodsCovered(amount: number, rent: number) {
  if (rent <= 0) return 0;
  return Math.floor(amount / rent);
}

/** Allocation persistable : uniquement sur les loyers matérialisés. */
export function persistedAllocations(s: Situation) {
  const out: { paymentId: string; chargeId: string; amount: number }[] = [];
  for (const l of s.lines) {
    if (l.kind !== "CHARGE" || !l.chargeId) continue;
    for (const a of l.allocations) out.push({ paymentId: a.transactionId, chargeId: l.chargeId, amount: a.amount });
  }
  return out;
}

/** Lignes couvertes par un paiement donné (y compris périodes futures) : sert aux quittances. */
export function linesForPayment(s: Situation, paymentId: string) {
  return s.lines
    .filter((l) => l.kind !== "DEBIT")
    .flatMap((l) => {
      const a = l.allocations.find((x) => x.transactionId === paymentId);
      return a ? [{ periodStart: l.periodStart!, periodEnd: l.periodEnd!, amount: a.amount, full: l.remaining === 0, lineAmount: l.amount }] : [];
    });
}
