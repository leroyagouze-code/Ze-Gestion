"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { ctxAssert } from "@/modules/auth/context";
import { putFile } from "@/lib/storage";
import { formToObject } from "@/lib/zod";
import { createExpense, deleteExpense } from "@/modules/expenses/service";

export async function createExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const data = formToObject(fd);
    const file = fd.get("attachment");
    delete data.attachmentUrl; // seule l'adresse produite par le serveur est acceptée
    if (file instanceof File && file.size > 0) {
      ctxAssert(ctx, "expenses.edit"); // droits vérifiés avant d'écrire sur le disque
      data.attachmentUrl = await putFile(ctx.companyId, file, { private: true });
    }
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
