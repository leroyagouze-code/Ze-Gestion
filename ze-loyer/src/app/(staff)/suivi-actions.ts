"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { resolveDispute } from "@/modules/disputes/service";
import { updateRequest } from "@/modules/requests/service";

export async function resolveDisputeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("dispute.resolve");
    await resolveDispute(ctx, formToObject(fd));
    revalidatePath("/contestations");
    return "Réponse envoyée au locataire";
  });
}

export async function updateRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("request.manage");
    await updateRequest(ctx, formToObject(fd));
    revalidatePath("/demandes");
    return "Demande mise à jour";
  });
}
