"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { uploadLeaseDocument } from "@/modules/documents/service";
import { closeDeposit } from "@/modules/finance/service";
import { endLease } from "@/modules/tenants/service";

export async function closeDepositAction(leaseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("deposit.write");
    await closeDeposit(ctx, formToObject(fd));
    revalidatePath(`/locations/${leaseId}`);
    return "Caution clôturée";
  });
}

export async function uploadDocumentAction(leaseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("document.write");
    const file = fd.get("file");
    await uploadLeaseDocument(ctx, leaseId, {
      title: String(fd.get("title") ?? ""),
      kind: fd.get("kind") === "CONTRACT" ? "CONTRACT" : "OTHER",
      file: file instanceof File ? file : (null as never),
    });
    revalidatePath(`/locations/${leaseId}`);
    return "Document ajouté";
  });
}

export async function endLeaseAction(leaseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("lease.write");
    await endLease(ctx, { leaseId, endDate: String(fd.get("endDate") ?? "") });
    revalidatePath(`/locations/${leaseId}`);
    return "Location terminée. Le logement est de nouveau vacant.";
  });
}
