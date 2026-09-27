import { randomUUID } from "node:crypto";
import { signup } from "@/modules/auth/service";
import { loadContext, type AppContext } from "@/modules/auth/context";

export async function newCompany(name = "Boutique Test"): Promise<AppContext> {
  const email = `t-${randomUUID()}@test.local`;
  const res = await signup({ companyName: name, ownerName: "Koffi Test", email, password: "motdepasse123" });
  const ctx = await loadContext({ userId: res.userId, fullName: "Koffi Test", email, isSuperAdmin: false }, res.companyId);
  if (!ctx) throw new Error("contexte introuvable");
  return ctx;
}
