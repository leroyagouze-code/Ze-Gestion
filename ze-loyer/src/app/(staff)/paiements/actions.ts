"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { cancelPayment, recordPayment } from "@/modules/finance/service";

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireStaff("payment.write");
    id = (await recordPayment(ctx, formToObject(fd))).paymentId;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/paiements/${id}?nouveau=1`);
}

export async function cancelPaymentAction(paymentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("payment.cancel");
    await cancelPayment(ctx, paymentId, String(fd.get("reason") ?? ""));
    revalidatePath(`/paiements/${paymentId}`);
    return "Paiement annulé. Il reste visible dans l'historique.";
  });
}
