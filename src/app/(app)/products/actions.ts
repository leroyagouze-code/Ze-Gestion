"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, runAction, type ActionState } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { ctxAssert, type AppContext } from "@/modules/auth/context";
import { putFile } from "@/lib/storage";
import { formToObject } from "@/lib/zod";
import { createProduct, deleteProduct, importProducts, updateProduct } from "@/modules/products/service";

async function withImage(fd: FormData, ctx: AppContext) {
  const data = formToObject(fd);
  delete data.imageUrl; // seule l'adresse produite par le serveur est acceptée
  const file = fd.get("image");
  if (file instanceof File && file.size > 0) {
    ctxAssert(ctx, "products.edit"); // droits vérifiés avant d'écrire sur le disque
    data.imageUrl = await putFile(ctx.companyId, file, { imagesOnly: true });
  }
  return data;
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  let id: string;
  try {
    id = await createProduct(ctx, (await withImage(fd, ctx)) as never);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/products");
  redirect(fd.get("$next") === "new" ? "/products/new?created=1" : `/products/${id}`);
}

export async function updateProductAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const res = await runAction(async () => updateProduct(ctx, id, (await withImage(fd, ctx)) as never));
  revalidatePath(`/products/${id}`);
  return res;
}

export async function deleteProductAction(id: string) {
  const ctx = await requireContext();
  await deleteProduct(ctx, id);
  revalidatePath("/products");
  redirect("/products");
}

export async function importProductsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV" };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop volumineux (5 Mo max)" };
  const text = (await file.text()).replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [";", ",", "\t"],
    transformHeader: (h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"),
  });
  try {
    const r = await importProducts(ctx, parsed.data);
    revalidatePath("/products");
    const errs = r.errors.slice(0, 10).map((e) => `ligne ${e.line} : ${e.message}`).join(" | ");
    return { ok: `${r.created} créés, ${r.updated} mis à jour, ${r.skipped} ignorés.${errs ? ` ${errs}` : ""}` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
