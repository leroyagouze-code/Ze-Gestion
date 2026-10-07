"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { createProperty, createUnit, setUnitReserved, updateProperty, updateUnit } from "@/modules/properties/service";

export async function createPropertyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireStaff("property.write");
    id = (await createProperty(ctx, formToObject(fd))).id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/biens/${id}?nouveau=1`);
}

export async function updatePropertyAction(propertyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireStaff("property.write");
    await updateProperty(ctx, propertyId, formToObject(fd));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/biens/${propertyId}`);
}

export async function createUnitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("property.write");
    const u = await createUnit(ctx, formToObject(fd));
    revalidatePath(`/biens/${u.propertyId}`);
    return `Logement ${u.label} ajouté`;
  });
}

export async function updateUnitAction(unitId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStaff("property.write");
    await updateUnit(ctx, unitId, formToObject(fd));
    revalidatePath(`/logements/${unitId}`);
    return "Logement mis à jour";
  });
}

export async function toggleReservedAction(unitId: string, reserved: boolean) {
  const ctx = await requireStaff("property.write");
  await setUnitReserved(ctx, unitId, reserved);
  revalidatePath(`/logements/${unitId}`);
}
