"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { ctxAssert } from "@/modules/auth/context";
import { putFile } from "@/lib/storage";
import { formToObject } from "@/lib/zod";
import { addPaymentMethod, saveTax, setTaxMode, setVisibleModules, togglePaymentMethod, updateCompany, updateSequence } from "@/modules/settings/service";

export async function updateCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const file = fd.get("logo");
    ctxAssert(ctx, "settings.manage"); // droits vérifiés avant d'écrire sur le disque
    const logoUrl = file instanceof File && file.size > 0 ? await putFile(ctx.companyId, file, { imagesOnly: true, logo: true }) : undefined;
    await updateCompany(ctx, formToObject(fd) as never, logoUrl);
    return "Paramètres enregistrés";
  });
  revalidatePath("/", "layout");
  return res;
}

export async function saveTaxAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => saveTax(ctx, id, { name: String(fd.get("name")), rate: String(fd.get("rate")).replace(",", "."), isDefault: fd.get("isDefault") === "on" }));
  revalidatePath("/settings/billing");
  return res;
}

export async function togglePaymentMethodAction(id: string, enabled: boolean) {
  const ctx = await requireContext();
  await togglePaymentMethod(ctx, id, enabled);
  revalidatePath("/settings/billing");
}

export async function addPaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => addPaymentMethod(ctx, String(fd.get("label") ?? ""), String(fd.get("type")) as never));
  revalidatePath("/settings/billing");
  return res;
}

export async function updateSequenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => updateSequence(ctx, { ...formToObject(fd), resetYearly: fd.get("resetYearly") === "on" } as never));
  revalidatePath("/settings/billing");
  return res;
}

export async function setTaxModeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await setTaxMode(ctx, fd.get("taxMode"));
    return "Mode de TVA enregistré";
  });
  revalidatePath("/", "layout");
  return res;
}

export async function setModulesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await setVisibleModules(ctx, fd.getAll("modules"));
    return "Menu mis à jour";
  });
  revalidatePath("/", "layout");
  return res;
}
