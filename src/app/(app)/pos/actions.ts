"use server";

import { revalidatePath } from "next/cache";
import { errorMessage } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { createInvoiceFromSale } from "@/modules/invoices/service";
import { createSale, type SaleInput } from "@/modules/sales/service";
import { createCustomerFromPos, searchCustomersForPos, type PosCustomer } from "@/modules/customers/service";

/** Recherche de client au fil de la frappe, depuis la caisse. */
export async function searchPosCustomersAction(q: string): Promise<PosCustomer[]> {
  const ctx = await requireContext();
  try {
    return await searchCustomersForPos(ctx, String(q ?? ""));
  } catch {
    return [];
  }
}

/** Nouveau client (nom + téléphone) créé sans quitter la vente, puis rattaché au panier. */
export async function createPosCustomerAction(input: { name: string; phone: string }) {
  const ctx = await requireContext();
  try {
    const customer = await createCustomerFromPos(ctx, { name: String(input?.name ?? ""), phone: String(input?.phone ?? "") });
    revalidatePath("/customers");
    return { ok: true as const, customer };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function createSaleAction(input: SaleInput, withInvoice: boolean) {
  const ctx = await requireContext();
  try {
    const sale = await createSale(ctx, input);
    const invoiceId = withInvoice ? await createInvoiceFromSale(ctx, sale.id) : null;
    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return { ok: true as const, ...sale, invoiceId };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}
