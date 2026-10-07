"use server";

import { revalidatePath } from "next/cache";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { inviteMember, inviteOwner } from "@/modules/invitations/service";
import { createOwner } from "@/modules/tenants/service";

export async function createOwnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("owner.manage");
    const o = await createOwner(ctx, formToObject(fd));
    revalidatePath("/proprietaires");
    return `${o.fullName} ajouté(e)`;
  });
}

export async function inviteOwnerAction(ownerId: string, _: ActionState): Promise<ActionState> {
  try {
    const ctx = await requireStaff("owner.manage");
    return { ok: "Lien prêt", data: await inviteOwner(ctx, ownerId) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function inviteMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireStaff("members.manage");
    return { ok: "Lien prêt", data: await inviteMember(ctx, formToObject(fd)) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
