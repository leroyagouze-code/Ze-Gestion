"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formatQty } from "@/lib/money";
import { formToObject } from "@/lib/zod";
import { recordManualMovement } from "@/modules/stock/service";

export async function movementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const data = formToObject(fd);
  const res = await runAction(async () => {
    const after = await recordManualMovement(ctx, data as never);
    return `Stock mis à jour : ${formatQty(after)}`;
  });
  revalidatePath(`/products/${data.productId}`);
  revalidatePath("/stock");
  return res;
}
