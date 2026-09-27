import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/auth/server";
import { homePath } from "@/lib/permissions";

export default async function Home() {
  if ((await getSession())?.mustChangePassword) redirect("/account/password");
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(homePath(ctx.permissions));
}
