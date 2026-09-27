export const INVOICE_STATUS = {
  draft: { label: "Brouillon", tone: "gray" },
  issued: { label: "Émise", tone: "blue" },
  partially_paid: { label: "Partiellement payée", tone: "amber" },
  paid: { label: "Payée", tone: "green" },
  cancelled: { label: "Annulée", tone: "red" },
} as const;
