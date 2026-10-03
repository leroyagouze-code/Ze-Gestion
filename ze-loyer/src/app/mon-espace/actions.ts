"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireTenant } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { createDispute } from "@/modules/disputes/service";
import { createRequest } from "@/modules/requests/service";

export async function createRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireTenant();
    await createRequest(ctx, formToObject(fd));
    revalidatePath("/mon-espace/demandes");
    return "Demande envoyée. Vous serez prévenu(e) de la réponse.";
  });
}

export async function createDisputeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireTenant();
    const file = fd.get("proof");
    await createDispute(ctx, formToObject(fd), file instanceof File && file.size > 0 ? file : null);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/mon-espace/demandes?signale=1");
}
