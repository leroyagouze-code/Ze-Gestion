"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { requestMeta, requireContext } from "@/lib/auth/server";
import { formatMoney } from "@/lib/money";
import { createSubscriptionOrder, previewSubscriptionPromo, simulateSubscriptionPayment } from "@/modules/billing/subscription-orders";

const payer = async () => {
  const ctx = await requireContext();
  return { companyId: ctx.companyId, userId: ctx.userId, isAdmin: ctx.isAdmin, isSuperAdmin: ctx.user.isSuperAdmin };
};

export async function subscribeAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    ref = await createSubscriptionOrder(await payer(), Object.fromEntries(fd), { ip: (await requestMeta()).ip });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/abonnement/${ref}`);
}

/** Aperçu du prix réduit : indicatif, le serveur recalcule tout à la commande. */
export async function previewSubscriptionPromoAction(code: string, plan: string, months: number) {
  await requireContext();
  try {
    const p = await previewSubscriptionPromo(code, plan, months, { ip: (await requestMeta()).ip });
    return { ok: true as const, code: p.code, list: formatMoney(p.listAmount, p.currency), discount: formatMoney(p.discount, p.currency), amount: formatMoney(p.amount, p.currency) };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function simulateSubscriptionAction(ref: string, outcome: "paid" | "failed") {
  await simulateSubscriptionPayment(await payer(), ref, outcome);
  redirect(`/abonnement/${ref}`);
}
