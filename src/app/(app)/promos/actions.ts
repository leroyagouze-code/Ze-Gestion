"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { deletePromo, savePromo, setPromoActive } from "@/modules/promos/service";

export async function savePromoAction(id: string | null, _s: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const row = await savePromo(ctx, id, formToObject(fd));
    revalidatePath("/promos");
    return id ? `Code ${row.code} modifié` : `Code ${row.code} créé`;
  });
  if (id && res?.ok) redirect("/promos");
  return res;
}

export async function togglePromoAction(id: string, isActive: boolean) {
  const ctx = await requireContext();
  await setPromoActive(ctx, id, isActive);
  revalidatePath("/promos");
}

export async function deletePromoAction(id: string, _s: ActionState): Promise<ActionState> {
  const ctx = await requireContext();
  return runAction(async () => {
    await deletePromo(ctx, id);
    revalidatePath("/promos");
    return "Code supprimé";
  });
}
