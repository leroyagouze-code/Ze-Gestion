import { redirect } from "next/navigation";
import { getContext, getSession, pendingStep } from "@/lib/auth/server";
import { homePath } from "@/lib/permissions";

export default async function Home() {
  const step = pendingStep(await getSession());
  if (step) redirect(step);
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(homePath(ctx.permissions));
}
