"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { formToObject } from "@/lib/zod";
import { addMember, deleteRole, resetMemberPassword, saveRole, updateMember } from "@/modules/users/service";

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await addMember(ctx, formToObject(fd) as never);
    return "Utilisateur ajouté. Communiquez-lui son email et son mot de passe provisoire : il devra le changer à sa première connexion.";
  });
  revalidatePath("/users");
  return res;
}

export async function updateMemberAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const roleId = String(fd.get("roleId") ?? "");
  const storeId = String(fd.get("storeId") ?? "");
  // Champ absent tant que l'entreprise n'a pas de caisse : on ne touche alors pas à la caisse par défaut.
  const registerId = fd.has("registerId") ? String(fd.get("registerId") ?? "") || null : undefined;
  const res = await runAction(() => updateMember(ctx, id, { roleId: roleId || undefined, storeId: storeId || null, registerId }));
  revalidatePath("/users");
  return res;
}

export async function toggleMemberAction(id: string, active: boolean) {
  const ctx = await requireContext();
  await updateMember(ctx, id, { isActive: active });
  revalidatePath("/users");
}

export async function saveRoleAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await saveRole(ctx, id, { name: String(fd.get("name") ?? ""), permissions: fd.getAll("permissions").map(String) as never });
    return "Rôle enregistré";
  });
  revalidatePath("/users/roles");
  return res;
}

export async function deleteRoleAction(id: string, _: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    await deleteRole(ctx, id);
    return "Rôle supprimé";
  });
  revalidatePath("/users/roles");
  return res;
}

export async function resetPasswordAction(id: string, _: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  return runAction(async () => {
    const temporary = await resetMemberPassword(ctx, id);
    return `Mot de passe provisoire : ${temporary} (à communiquer, il devra le changer à la connexion)`;
  });
}
