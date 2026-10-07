import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, endOfMonth, monthLabel } from "@/modules/finance/dates";
import {
  computeLedger,
  linesForPayment,
  periodAt,
  periodsCovered,
  persistedAllocations,
  scheduleUntil,
  type LeaseTerms,
  type LedgerCharge,
  type LedgerTransaction,
} from "@/modules/finance/ledger";

const terms: LeaseTerms = { startDate: "2026-08-01", endDate: null, rentAmount: 75000, periodicity: "MONTHLY", dueDay: 5 };

function charges(t: LeaseTerms, until: string): LedgerCharge[] {
  return scheduleUntil(t, until).map((p) => ({ id: `c${p.index}`, ...p }));
}

let n = 0;
const pay = (amount: number, date: string, type: LedgerTransaction["type"] = "LOYER"): LedgerTransaction => ({ id: `p${++n}`, type, amount, date, createdAt: n });

describe("Dates", () => {
  it("ajoute des mois et borne les fins de mois", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-01");
    expect(endOfMonth("2027-02-10")).toBe("2027-02-28");
    expect(periodAt({ ...terms, dueDay: 31 }, 1).dueDate).toBe("2026-09-30");
    expect(daysBetween("2026-09-05", "2026-09-17")).toBe(12);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(monthLabel("2026-10-01")).toBe("octobre 2026");
  });
});

describe("Échéancier", () => {
  it("génère une période par mois jusqu'au mois en cours", () => {
    const s = scheduleUntil(terms, "2026-10-02");
    expect(s.map((p) => p.periodStart)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(s[2].dueDate).toBe("2026-10-05");
  });

  it("ne place jamais la première échéance avant l'entrée", () => {
    expect(periodAt({ ...terms, startDate: "2026-08-20" }, 0).dueDate).toBe("2026-08-20");
  });

  it("gère une périodicité trimestrielle", () => {
    const s = scheduleUntil({ ...terms, periodicity: "QUARTERLY", rentAmount: 225000 }, "2027-01-10");
    expect(s.map((p) => [p.periodStart, p.periodEnd])).toEqual([
      ["2026-08-01", "2026-10-31"],
      ["2026-11-01", "2027-01-31"],
    ]);
  });

  it("s'arrête à la fin du bail", () => {
    expect(scheduleUntil({ ...terms, endDate: "2026-09-30" }, "2027-01-01")).toHaveLength(2);
  });
});

describe("Règles de paiement (brief)", () => {
  const oneMonth: LeaseTerms = { ...terms, startDate: "2026-10-01" };
  const oct = charges(oneMonth, "2026-10-10");

  it("Loyer 75 000, paiement 50 000 → reste 25 000, statut PARTIEL", () => {
    const s = computeLedger({ terms: oneMonth, charges: oct, transactions: [pay(50000, "2026-10-04")], today: "2026-10-04" });
    expect(s.balance).toBe(25000);
    expect(s.lines[0].status).toBe("PARTIAL");
    expect(s.lines[0].remaining).toBe(25000);
    expect(s.status).toBe("A_JOUR"); // pas encore en retard avant l'échéance
    expect(s.nextDue).toEqual({ date: "2026-10-05", amount: 25000 });
  });

  it("Paiement partiel non soldé après l'échéance → en retard", () => {
    const s = computeLedger({ terms: oneMonth, charges: oct, transactions: [pay(50000, "2026-10-04")], today: "2026-10-10" });
    expect(s.status).toBe("EN_RETARD");
    expect(s.overdueAmount).toBe(25000);
    expect(s.daysLate).toBe(5);
    expect(s.lines[0].overdue).toBe(true);
  });

  it("Loyer 75 000, paiement 75 000 → solde 0, statut PAYÉ", () => {
    const s = computeLedger({ terms: oneMonth, charges: oct, transactions: [pay(75000, "2026-10-05")], today: "2026-10-10" });
    expect(s.balance).toBe(0);
    expect(s.lines[0].status).toBe("PAID");
    expect(s.lines[0].paidOn).toBe("2026-10-05");
    expect(s.status).toBe("A_JOUR");
    expect(s.coveredUntil).toBe("2026-10-31");
  });

  it("Avance 450 000 / loyer 75 000 → 6 mois couverts", () => {
    expect(periodsCovered(450000, 75000)).toBe(6);
  });

  it("Paiement de 450 000 réparti d'octobre à mars, à jour jusqu'au 31 mars 2027", () => {
    const s = computeLedger({ terms: oneMonth, charges: oct, transactions: [pay(450000, "2026-10-01", "AVANCE")], today: "2026-10-01" });
    const covered = s.lines.filter((l) => l.paid > 0);
    expect(covered.map((l) => [l.periodStart, l.paid])).toEqual([
      ["2026-10-01", 75000],
      ["2026-11-01", 75000],
      ["2026-12-01", 75000],
      ["2027-01-01", 75000],
      ["2027-02-01", 75000],
      ["2027-03-01", 75000],
    ]);
    expect(s.coveredUntil).toBe("2027-03-31");
    expect(s.status).toBe("EN_AVANCE");
    expect(s.advance).toBe(375000);
    expect(s.periodsAhead).toBe(5);
    expect(s.balance).toBe(-375000);
    expect(s.nextDue).toEqual({ date: "2027-04-05", amount: 75000 });
  });
});

describe("Arriérés et répartition", () => {
  it("affecte les paiements aux mois les plus anciens (FIFO)", () => {
    const ch = charges(terms, "2026-10-06"); // août, sept, oct
    const s = computeLedger({ terms, charges: ch, transactions: [pay(75000, "2026-08-05"), pay(25000, "2026-09-20")], today: "2026-10-06" });
    expect(s.lines.map((l) => l.status)).toEqual(["PAID", "PARTIAL", "LATE"]);
    expect(s.overdueAmount).toBe(50000 + 75000);
    expect(s.oldestOverdue).toBe("2026-09-05");
    expect(s.status).toBe("EN_RETARD");
  });

  it("détail du solde : septembre 75 000 + octobre 50 000 = 125 000", () => {
    const t2 = { ...terms, startDate: "2026-09-01" };
    const s = computeLedger({ terms: t2, charges: charges(t2, "2026-10-20"), transactions: [pay(25000, "2026-10-12")], today: "2026-10-20" });
    expect(s.balance).toBe(125000);
    expect(s.lines.map((l) => l.remaining)).toEqual([50000, 75000]);
    // FIFO : le versement éteint d'abord septembre
  });

  it("ignore les paiements de caution, charges et frais dans le solde loyer", () => {
    const ch = charges(terms, "2026-08-10");
    const s = computeLedger({
      terms,
      charges: ch,
      transactions: [pay(150000, "2026-08-01", "CAUTION"), pay(5000, "2026-08-01", "FRAIS"), pay(3000, "2026-08-01", "CHARGE")],
      today: "2026-08-10",
    });
    expect(s.balance).toBe(75000);
    expect(s.totalCredited).toBe(0);
  });

  it("un remboursement consomme l'avance, un ajustement négatif crée une dette", () => {
    const ch = charges(terms, "2026-08-10");
    const s1 = computeLedger({ terms, charges: ch, transactions: [pay(150000, "2026-08-01"), pay(75000, "2026-08-08", "REMBOURSEMENT")], today: "2026-08-10" });
    expect(s1.balance).toBe(0);
    expect(s1.advance).toBe(0);
    const s2 = computeLedger({ terms, charges: ch, transactions: [pay(75000, "2026-08-01"), pay(-10000, "2026-08-03", "AJUSTEMENT")], today: "2026-08-10" });
    expect(s2.balance).toBe(10000);
    expect(s2.status).toBe("EN_RETARD");
  });

  it("le solde se recalcule entièrement à partir des opérations", () => {
    const ch = charges(terms, "2026-12-10");
    const txs = [pay(100000, "2026-08-03"), pay(60000, "2026-09-30"), pay(140000, "2026-11-02")];
    const s = computeLedger({ terms, charges: ch, transactions: txs, today: "2026-12-10" });
    expect(s.balance).toBe(5 * 75000 - 300000);
    const alloc = persistedAllocations(s);
    expect(alloc.reduce((a, x) => a + x.amount, 0)).toBe(300000);
  });

  it("donne les périodes couvertes par un paiement (quittance)", () => {
    const ch = charges(terms, "2026-08-10");
    const p = pay(150000, "2026-08-02");
    const s = computeLedger({ terms, charges: ch, transactions: [p], today: "2026-08-10" });
    expect(linesForPayment(s, p.id).map((l) => [l.periodStart, l.amount, l.full])).toEqual([
      ["2026-08-01", 75000, true],
      ["2026-09-01", 75000, true],
    ]);
  });
});
