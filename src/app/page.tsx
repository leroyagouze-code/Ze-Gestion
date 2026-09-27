import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(can(ctx.permissions, "dashboard.view") ? "/dashboard" : "/pos");
}
