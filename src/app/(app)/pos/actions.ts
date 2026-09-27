"use server";

import { revalidatePath } from "next/cache";
import { errorMessage } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { createInvoiceFromSale } from "@/modules/invoices/service";
import { createSale, type SaleInput } from "@/modules/sales/service";

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
