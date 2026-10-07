"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/server";
import { markAllRead } from "@/modules/notifications/service";

export async function markAllReadAction() {
  const s = await getSession();
  if (!s) return;
  await markAllRead(s.userId);
  revalidatePath("/", "layout");
}
