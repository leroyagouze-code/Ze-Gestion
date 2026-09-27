"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { formToObject } from "@/lib/zod";
import { createCustomer, recordCustomerPayment, updateCustomer } from "@/modules/customers/service";

export async function createCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  let id: string;
  try {
    id = await createCustomer(ctx, formToObject(fd) as never);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/customers/${id}`);
}

export async function updateCustomerAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => updateCustomer(ctx, id, formToObject(fd) as never));
  revalidatePath(`/customers/${id}`);
  return res;
}

export async function customerPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const data = formToObject(fd);
  const res = await runAction(async () => {
    const amount = await recordCustomerPayment(ctx, data as never);
    return amount > 0 ? `Encaissement de ${formatMoney(amount, ctx.company.currency)} enregistré` : "Aucune dette à régler";
  });
  revalidatePath(`/customers/${data.customerId}`);
  return res;
}
