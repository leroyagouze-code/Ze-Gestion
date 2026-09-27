"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { createInvoiceFromSale } from "@/modules/invoices/service";
import { cancelSale } from "@/modules/sales/service";

export async function cancelSaleAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await cancelSale(ctx, id, String(fd.get("reason") ?? ""));
    return "Vente annulée, stock restauré";
  });
  revalidatePath(`/sales/${id}`);
  return res;
}

export async function invoiceFromSaleAction(id: string) {
  const ctx = await requireContext();
  const invoiceId = await createInvoiceFromSale(ctx, id);
  redirect(`/invoices/${invoiceId}`);
}
