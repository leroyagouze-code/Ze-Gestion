"use client";

import { DocumentEditor, type InvoiceInitial } from "@/components/document-editor";
import type { TaxMode } from "@/lib/money";

/** Facture manuelle : l'éditeur partagé avec les proformas, en mode facture. */
export function InvoiceEditor(props: {
  customers: { id: string; name: string }[];
  taxes: { id: string; name: string; rate: number; isDefault: boolean }[];
  currency: string;
  decimals: number;
  taxMode?: TaxMode;
  initial?: InvoiceInitial;
}) {
  return <DocumentEditor kind="invoice" {...props} />;
}
