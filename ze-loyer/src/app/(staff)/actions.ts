"use server";

import { revalidatePath } from "next/cache";
import { errorMessage, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { remindTenant } from "@/modules/reminders/service";

export async function remindAction(leaseId: string, _: ActionState): Promise<ActionState> {
  try {
    const ctx = await requireStaff();
    const r = await remindTenant(ctx, leaseId);
    revalidatePath("/impayes");
    return {
      ok: r.inApp ? "Rappel envoyé dans l'espace du locataire." : r.hasAccount ? "Rappel déjà envoyé aujourd'hui dans son espace." : "Le locataire n'a pas encore son espace ZE LOYER.",
      data: { whatsapp: r.whatsapp, sms: r.sms },
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
