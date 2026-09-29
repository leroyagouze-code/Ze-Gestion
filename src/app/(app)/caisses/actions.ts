"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { closeCashSession, createRegister, openCashSession, updateRegister } from "@/modules/registers/service";

export async function createRegisterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await createRegister(ctx, { name: String(fd.get("name") ?? ""), storeId: String(fd.get("storeId") ?? "") });
    return "Caisse ajoutée";
  });
  revalidatePath("/caisses");
  return res;
}

export async function renameRegisterAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => updateRegister(ctx, id, { name: String(fd.get("name") ?? "") }));
  revalidatePath("/caisses");
  return res;
}

export async function toggleRegisterAction(id: string, active: boolean, _: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => updateRegister(ctx, id, { isActive: active }));
  revalidatePath("/caisses");
  return res;
}

export async function openSessionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await openCashSession(ctx, { registerId: String(fd.get("registerId") ?? ""), openingFloat: String(fd.get("openingFloat") ?? "0") });
    return "Caisse ouverte";
  });
  revalidatePath("/pos");
  revalidatePath("/caisses");
  return res;
}

export async function closeSessionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await closeCashSession(ctx, id, { countedCash: String(fd.get("countedCash") ?? ""), notes: String(fd.get("notes") ?? "") });
  });
  if (res?.error) return res;
  revalidatePath("/caisses");
  revalidatePath("/pos");
  redirect(`/caisses/sessions/${id}`);
}
