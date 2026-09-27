"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/actions";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { issueLicense } from "@/modules/billing/license";
import { savePrice } from "@/modules/billing/license-orders";
import { grantFreeAccess, extendTrial, recordSubscriptionPayment, setCompanyPlan, setCompanyStatus, setUnlimited } from "@/modules/admin/service";

async function admin() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  return s;
}

function refresh(companyId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/entreprises");
  revalidatePath(`/admin/companies/${companyId}`);
}

export async function setStatusAction(companyId: string, status: "active" | "suspended", _s: ActionState): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    await setCompanyStatus(s, companyId, status);
    refresh(companyId);
    return status === "active" ? "Entreprise réactivée" : "Entreprise suspendue";
  });
}

export async function setPlanAction(companyId: string, _s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    await setCompanyPlan(s, companyId, String(fd.get("planId")));
    refresh(companyId);
    return "Formule modifiée";
  });
}

export async function extendTrialAction(companyId: string, _s: ActionState): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    await extendTrial(s, companyId, 14);
    refresh(companyId);
    return "Essai prolongé de 14 jours";
  });
}

export async function recordPaymentAction(companyId: string, _s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    const end = await recordSubscriptionPayment(s, companyId, Object.fromEntries(fd));
    refresh(companyId);
    return `Paiement enregistré. Accès payé jusqu'au ${formatDate(end)}.`;
  });
}

export async function setUnlimitedAction(companyId: string, on: boolean, _s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    await setUnlimited(s, companyId, on, fd.get("note") ? String(fd.get("note")) : null);
    refresh(companyId);
    return on ? "Accès illimité activé" : "Accès illimité retiré";
  });
}

export async function issueLicenseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  let data: unknown;
  const res = await runAction(async () => {
    const row = await issueLicense(s, Object.fromEntries(fd));
    data = { code: row.code, installId: row.installId, plan: row.plan, expiresAt: row.expiresAt?.toISOString() ?? null };
    revalidatePath("/admin/licences");
    return "Code de licence créé";
  });
  return data ? { ...res, data } : res;
}

export async function grantFreeAccessAction(companyId: string, _s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    const end = await grantFreeAccess(s, companyId, Object.fromEntries(fd));
    refresh(companyId);
    return end ? `Compte activé gratuitement jusqu'au ${formatDate(end)}` : "Compte activé gratuitement, sans limite";
  });
}

export async function savePriceAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const s = await admin();
  return runAction(async () => {
    await savePrice(s, Object.fromEntries(fd));
    revalidatePath("/admin/licences");
    return "Tarif enregistré";
  });
}
