"use server";

import { redirect } from "next/navigation";
import { errorMessage, type ActionState } from "@/lib/actions";
import { getSession, requestMeta } from "@/lib/auth/server";
import { canPayOnline } from "@/modules/billing/subscription-orders";
import { formatMoney } from "@/lib/money";
import { createOrder, previewPromo, simulatePayment } from "@/modules/billing/license-orders";

export async function createOrderAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    if (!canPayOnline({ isSuperAdmin: (await getSession())?.isSuperAdmin })) return { error: "La vente en ligne n'est pas encore ouverte. Contactez ZE GROUP." };
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
  // Mode test en production : seul le super admin peut valider un faux paiement
  if (!canPayOnline({ isSuperAdmin: (await getSession())?.isSuperAdmin })) redirect(`/acheter-licence/${ref}`);
  await simulatePayment(ref, outcome);
  redirect(`/acheter-licence/${ref}`);
}
