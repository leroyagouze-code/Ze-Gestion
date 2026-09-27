"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { putFile } from "@/lib/storage";
import { formToObject } from "@/lib/zod";
import { createExpense, deleteExpense } from "@/modules/expenses/service";

export async function createExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const data = formToObject(fd);
    const file = fd.get("attachment");
    if (file instanceof File && file.size > 0) data.attachmentUrl = await putFile(ctx.companyId, file);
    await createExpense(ctx, data as never);
    return "Dépense enregistrée";
  });
  revalidatePath("/expenses");
  return res;
}

export async function deleteExpenseAction(id: string) {
  const ctx = await requireContext();
  await deleteExpense(ctx, id);
  revalidatePath("/expenses");
}
