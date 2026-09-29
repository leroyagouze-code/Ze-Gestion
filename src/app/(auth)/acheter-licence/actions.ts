"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { requestMeta } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { createOrder, previewPromo, simulatePayment } from "@/modules/billing/license-orders";

export async function createOrderAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    ref = await createOrder(Object.fromEntries(fd), { ip: (await requestMeta()).ip });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/acheter-licence/${ref}`);
}

/** Aperçu du prix réduit : indicatif, le serveur recalcule tout à la commande. */
export async function previewPromoAction(code: string, offer: string) {
  try {
    const p = await previewPromo(code, offer, { ip: (await requestMeta()).ip });
    return { ok: true as const, code: p.code, list: formatMoney(p.listAmount, p.currency), discount: formatMoney(p.discount, p.currency), amount: formatMoney(p.amount, p.currency) };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function simulateAction(ref: string, outcome: "paid" | "failed") {
  await simulatePayment(ref, outcome);
  redirect(`/acheter-licence/${ref}`);
}
