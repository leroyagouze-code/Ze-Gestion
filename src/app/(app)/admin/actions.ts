"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { extendTrial, setCompanyPlan, setCompanyStatus } from "@/modules/admin/service";

async function admin() {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  return s;
}

export async function setStatusAction(companyId: string, status: "active" | "suspended") {
  const s = await admin();
  await setCompanyStatus(s, companyId, status);
  revalidatePath("/admin");
}

export async function setPlanAction(companyId: string, fd: FormData) {
  const s = await admin();
  await setCompanyPlan(s, companyId, String(fd.get("planId")));
  revalidatePath("/admin");
}

export async function extendTrialAction(companyId: string) {
  const s = await admin();
  await extendTrial(s, companyId, 14);
  revalidatePath("/admin");
}
