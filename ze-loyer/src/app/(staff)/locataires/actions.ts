"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { inviteTenant } from "@/modules/invitations/service";
import { createLease, createTenant, updateTenant } from "@/modules/tenants/service";

export async function createTenantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const ctx = await requireStaff("tenant.write");
    const res = await createTenant(ctx, formToObject(fd));
    target = res.leaseId ? `/locations/${res.leaseId}?nouveau=1` : `/locataires/${res.tenant.id}`;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(target);
}

export async function updateTenantAction(tenantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("tenant.write");
    await updateTenant(ctx, tenantId, formToObject(fd));
    revalidatePath(`/locataires/${tenantId}`);
    return "Fiche mise à jour";
  });
}

export async function createLeaseAction(tenantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireStaff("lease.write");
    id = (await createLease(ctx, { ...(formToObject(fd) as Record<string, string>), tenantId } as never)).id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/locations/${id}?nouveau=1`);
}

export async function inviteTenantAction(tenantId: string, _: ActionState): Promise<ActionState> {
  try {
    const ctx = await requireStaff("invite.send");
    const inv = await inviteTenant(ctx, tenantId);
    return { ok: "Lien d'invitation prêt", data: inv };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
