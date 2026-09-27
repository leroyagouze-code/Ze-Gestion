"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { activateLicense } from "@/modules/billing/license";

export async function activateLicenseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  return runAction(async () => {
    const l = await activateLicense(ctx, String(fd.get("code") ?? ""));
    revalidatePath("/", "layout");
    return `Licence activée : formule ${l.plan}, ${l.expiresAt ? `valable jusqu'au ${formatDate(l.expiresAt)}` : "à vie"}.`;
  });
}
