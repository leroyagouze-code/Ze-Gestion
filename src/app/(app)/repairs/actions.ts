"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import {
  addRepairItem,
  createRepairOrder,
  invoiceRepairOrder,
  removeRepairItem,
  setRepairStatus,
  updateRepairOrder,
} from "@/modules/repairs/service";

export async function createRepairAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  let id: string;
  try {
    id = await createRepairOrder(ctx, formToObject(fd) as never);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/repairs");
  redirect(`/repairs/${id}`);
}

export async function addRepairItemAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await addRepairItem(ctx, id, formToObject(fd) as never);
    return fd.get("kind") === "part" ? "Pièce ajoutée" : "Main-d'œuvre ajoutée";
  });
  revalidatePath(`/repairs/${id}`);
  return res;
}

export async function removeRepairItemAction(id: string, itemId: string) {
  const ctx = await requireContext();
  await removeRepairItem(ctx, id, itemId);
  revalidatePath(`/repairs/${id}`);
}

export async function updateRepairAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await updateRepairOrder(ctx, id, formToObject(fd) as never);
    return "Enregistré";
  });
  revalidatePath(`/repairs/${id}`);
  return res;
}

export async function setRepairStatusAction(id: string, status: "open" | "in_progress" | "done" | "cancelled") {
  const ctx = await requireContext();
  await setRepairStatus(ctx, id, status);
  revalidatePath(`/repairs/${id}`);
  revalidatePath("/repairs");
}

export async function invoiceRepairAction(id: string, _: ActionState): Promise<ActionState> {
  const ctx = await requireContext();
  let invoiceId: string;
  try {
    invoiceId = await invoiceRepairOrder(ctx, id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/repairs");
  redirect(`/invoices/${invoiceId}`);
}
