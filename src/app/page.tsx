import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth/server";
import { homePath } from "@/lib/permissions";

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(homePath(ctx.permissions));
}
