"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { createOrder, simulatePayment } from "@/modules/billing/license-orders";

export async function createOrderAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    ref = await createOrder(Object.fromEntries(fd));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/acheter-licence/${ref}`);
}

export async function simulateAction(ref: string, outcome: "paid" | "failed") {
  await simulatePayment(ref, outcome);
  redirect(`/acheter-licence/${ref}`);
}
