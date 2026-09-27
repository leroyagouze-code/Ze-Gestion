import { and, eq } from "drizzle-orm";
import { memberships, roles, stores } from "@/db/schema";
import { withTenant, type TenantContext } from "@/db/tenant";
import { getCompany } from "@/lib/auth/session";
import { ADMIN_ROLE, ALL_PERMISSIONS, assertCan, can, type Permission } from "@/lib/permissions";

export type AppContext = TenantContext & {
  userId: string;
  user: { fullName: string; email: string; isSuperAdmin: boolean; mustChangePassword: boolean };
  company: NonNullable<Awaited<ReturnType<typeof getCompany>>>;
  roleName: string;
  isAdmin: boolean;
  permissions: string[];
  storeId: string;
  ip?: string | null;
};

export async function loadContext(
  user: { userId: string; fullName: string; email: string; isSuperAdmin: boolean; mustChangePassword?: boolean },
  companyId: string,
): Promise<AppContext | null> {
  const company = await getCompany(companyId);
  if (!company || company.status !== "active") return null;
  const data = await withTenant({ companyId, userId: user.userId }, async (tx) => {
    const [m] = await tx
      .select({ roleName: roles.name, permissions: roles.permissions, isSystem: roles.isSystem, storeId: memberships.storeId })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, user.userId), eq(memberships.companyId, companyId), eq(memberships.isActive, true)))
      .limit(1);
    if (!m) return null;
    let storeId = m.storeId;
    if (!storeId) {
      const [s] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.isDefault, true)).limit(1);
      storeId = s?.id ?? null;
    }
    return storeId ? { ...m, storeId } : null;
  });
  if (!data) return null;
  const isAdmin = data.isSystem && data.roleName === ADMIN_ROLE;
  return {
    companyId,
    userId: user.userId,
    user: { fullName: user.fullName, email: user.email, isSuperAdmin: user.isSuperAdmin, mustChangePassword: !!user.mustChangePassword },
    company,
    roleName: data.roleName,
    isAdmin,
    // L'administrateur détient toujours tous les droits, même ceux ajoutés après la création du rôle.
    permissions: isAdmin ? [...ALL_PERMISSIONS] : data.permissions,
    storeId: data.storeId,
  };
}

export const ctxCan = (ctx: AppContext, p: Permission) => can(ctx.permissions, p);
export const ctxAssert = (ctx: AppContext, p: Permission) => assertCan(ctx.permissions, p);
