"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { createSupplier, updateSupplier } from "@/modules/suppliers/service";

export async function createSupplierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  let id: string;
  try {
    id = await createSupplier(ctx, formToObject(fd) as never);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/suppliers/${id}`);
}

export async function updateSupplierAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(() => updateSupplier(ctx, id, formToObject(fd) as never));
  revalidatePath(`/suppliers/${id}`);
  return res;
}
