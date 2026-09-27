"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import { activateLicense, fetchLicenseFromServer } from "@/modules/billing/license";

export async function activateLicenseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  return runAction(async () => {
    const l = await activateLicense(ctx, String(fd.get("code") ?? ""));
    revalidatePath("/", "layout");
    return `Licence activée : formule ${l.plan}, ${l.expiresAt ? `valable jusqu'au ${formatDate(l.expiresAt)}` : "à vie"}.`;
  });
}

export async function fetchLicenseAction(_s?: ActionState): Promise<ActionState> {
  const ctx = await requireContext();
  return runAction(async () => {
    if (!ctx.isAdmin) throw new BusinessError("Seul l'administrateur peut activer la licence");
    const r = await fetchLicenseFromServer(ctx.companyId, ctx.userId);
    if (r === "none") throw new BusinessError("Aucun achat trouvé pour cet ordinateur. Si vous venez de payer, patientez une minute puis réessayez.");
    if (r === "same") return "Votre licence est déjà active et à jour.";
    revalidatePath("/", "layout");
    return `Licence activée : formule ${r.plan}, ${r.expiresAt ? `valable jusqu'au ${formatDate(r.expiresAt)}` : "à vie"}.`;
  });
}
