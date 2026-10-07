import type { TransactionType } from "./ledger";

export const TYPE_LABELS: Record<TransactionType, string> = {
  LOYER: "Loyer",
  AVANCE: "Avance sur loyer",
  CAUTION: "Caution",
  CHARGE: "Charges",
  FRAIS: "Frais",
  REMBOURSEMENT: "Remboursement",
  AJUSTEMENT: "Ajustement",
  AUTRE: "Autre",
};

export type PaymentMethod = "CASH" | "TMONEY" | "FLOOZ" | "BANK" | "OTHER";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  TMONEY: "TMoney / Mixx by Yas",
  FLOOZ: "Flooz",
  BANK: "Virement bancaire",
  OTHER: "Autre",
};

export const PERIODICITY_LABELS = { MONTHLY: "Mensuel", QUARTERLY: "Trimestriel", SEMIANNUAL: "Semestriel", YEARLY: "Annuel" } as const;

export const UNIT_TYPE_LABELS = {
  CHAMBRE: "Chambre",
  STUDIO: "Studio",
  APPARTEMENT: "Appartement",
  MAISON: "Maison",
  BOUTIQUE: "Boutique",
  BUREAU: "Bureau",
  AUTRE: "Autre",
} as const;

export const DEPOSIT_STATUS_LABELS = {
  DEPOSITED: "Déposée",
  PARTIALLY_REFUNDED: "Remboursée en partie",
  REFUNDED: "Remboursée",
  RETAINED: "Retenue",
} as const;

export const toOptions = <T extends string>(o: Record<T, string>) => (Object.entries(o) as [T, string][]).map(([value, label]) => ({ value, label }));
