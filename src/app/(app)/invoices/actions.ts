"use server";

import { revalidatePath } from "next/cache";
import { runAction, errorMessage, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { cancelInvoice, createManualInvoice, recordInvoicePayment } from "@/modules/invoices/service";
import type { z } from "zod";
import type { manualInvoiceSchema } from "@/modules/invoices/service";

export async function invoicePaymentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const paid = await recordInvoicePayment(ctx, id, String(fd.get("paymentMethodId")), Number(String(fd.get("amount") ?? "").replace(/\s/g, "").replace(",", ".")), String(fd.get("reference") ?? "") || null);
    return `Paiement de ${formatMoney(paid, ctx.company.currency)} enregistré`;
  });
  revalidatePath(`/invoices/${id}`);
  return res;
}

export async function cancelInvoiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await cancelInvoice(ctx, id, String(fd.get("reason") ?? ""));
    return "Facture annulée";
  });
  revalidatePath(`/invoices/${id}`);
  return res;
}

export async function createManualInvoiceAction(input: z.input<typeof manualInvoiceSchema>) {
  const ctx = await requireContext();
  try {
    return { ok: true as const, id: await createManualInvoice(ctx, input) };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}
