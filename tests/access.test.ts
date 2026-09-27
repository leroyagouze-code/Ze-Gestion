import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { ALL_PERMISSIONS, can } from "@/lib/permissions";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { createProduct } from "@/modules/products/service";
import { createSale, getSale, listSales, posBootstrap } from "@/modules/sales/service";
import { createCustomer, updateCustomer } from "@/modules/customers/service";
import { createInvoiceFromSale } from "@/modules/invoices/service";
import { addMember, deleteRole, listMembers, saveRole, updateMember } from "@/modules/users/service";
import { newCompany } from "./helpers";

/** Ajoute un vrai membre avec le rôle donné et renvoie son contexte, comme à la connexion. */
async function member(admin: AppContext, roleName: string): Promise<AppContext> {
  const { roles } = await listMembers(admin);
  const role = roles.find((r) => r.name === roleName);
  if (!role) throw new Error(`rôle ${roleName} introuvable`);
  const email = `m-${randomUUID()}@test.local`;
  const userId = await addMember(admin, { fullName: `Membre ${roleName}`, email, password: "motdepasse123", roleId: role.id, storeId: "", phone: "" }); // valeurs vides comme le formulaire
  const ctx = await loadContext({ userId, fullName: `Membre ${roleName}`, email, isSuperAdmin: false }, admin.companyId);
  if (!ctx) throw new Error("contexte introuvable");
  return ctx;
}

async function setup() {
  const admin = await newCompany("Boutique Niveaux");
  // Formule Business : plusieurs utilisateurs
  await db
    .update(subscriptions)
    .set({ planId: sql`(select id from plans where code = 'BUSINESS')` })
    .where(eq(subscriptions.companyId, admin.companyId));
  const pid = await createProduct(admin, { name: "Huile 1L", salePrice: 1500, purchasePrice: 1100, initialStock: 50 });
  const { paymentMethods } = await posBootstrap(admin);
  const cash = paymentMethods.find((p) => p.type === "cash")!;
  const credit = paymentMethods.find((p) => p.type === "credit");
  return { admin, pid, cash, credit };
}

describe("accès par niveau", () => {
  it("l'administrateur détient toutes les permissions", async () => {
    const { admin } = await setup();
    expect(admin.isAdmin).toBe(true);
    expect([...admin.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("le caissier vend, sans remise, sans crédit, et ne voit que ses ventes", async () => {
    const { admin, pid, cash, credit } = await setup();
    const cashier = await member(admin, "Caissier");
    expect(cashier.isAdmin).toBe(false);

    const own = await createSale(cashier, { items: [{ productId: pid, quantity: 1 }], payments: [{ paymentMethodId: cash.id, amount: 1500 }] });
    await expect(
      createSale(cashier, { items: [{ productId: pid, quantity: 1, discount: 200 }], payments: [{ paymentMethodId: cash.id, amount: 1300 }] }),
    ).rejects.toThrow(/remises/);
    await expect(
      createSale(cashier, { items: [{ productId: pid, quantity: 1 }], discount: 100, payments: [{ paymentMethodId: cash.id, amount: 1400 }] }),
    ).rejects.toThrow(/remises/);

    const client = await createCustomer(cashier, { name: "Ama Mensah", phone: "90000000" });
    await expect(
      createSale(cashier, { items: [{ productId: pid, quantity: 1 }], customerId: client, payments: credit ? [{ paymentMethodId: credit.id, amount: 0 }] : [] }),
    ).rejects.toThrow(/crédit/);

    // Il peut ajouter un client mais pas modifier une fiche existante
    await expect(updateCustomer(cashier, client, { name: "Autre nom" })).rejects.toThrow(/Permission/);

    const other = await createSale(admin, { items: [{ productId: pid, quantity: 1 }], discount: 100, payments: [{ paymentMethodId: cash.id, amount: 1400 }] });
    const list = await listSales(cashier, {});
    expect(list.rows.map((r) => r.id)).toEqual([own.id]);
    await expect(getSale(cashier, other.id)).rejects.toThrow(/Vente/);
    expect((await listSales(admin, {})).rows).toHaveLength(2);

    expect(can(cashier.permissions, "data.export")).toBe(false);
    await expect(createInvoiceFromSale(cashier, own.id)).rejects.toThrow(/Permission/);
  });

  it("un gestionnaire délégué ne peut pas s'attribuer plus de droits que les siens", async () => {
    const { admin } = await setup();
    await saveRole(admin, null, { name: "Chef de caisse", permissions: ["users.manage", "sales.create", "sales.view", "sales.view_all"] });
    const chef = await member(admin, "Chef de caisse");
    const { roles, members } = await listMembers(chef);
    const adminRole = roles.find((r) => r.name === "Administrateur")!;
    const gerant = roles.find((r) => r.name === "Gérant")!;
    const caissier = roles.find((r) => r.name === "Caissier")!;
    const owner = members.find((m) => m.isOwner)!;
    const self = members.find((m) => m.userId === chef.userId)!;

    await expect(
      addMember(chef, { fullName: "Pirate", email: `p-${randomUUID()}@test.local`, password: "motdepasse123", roleId: adminRole.id }),
    ).rejects.toThrow(/administrateur/i);
    await expect(
      addMember(chef, { fullName: "Pirate", email: `p-${randomUUID()}@test.local`, password: "motdepasse123", roleId: gerant.id }),
    ).rejects.toThrow(/droits que vous n'avez pas/);
    await expect(saveRole(chef, null, { name: "Super", permissions: ["settings.manage"] })).rejects.toThrow(/droits que vous n'avez pas/);
    await expect(saveRole(chef, caissier.id, { name: "Caissier", permissions: ["sales.create", "reports.profit"] })).rejects.toThrow(/droits/);
    await expect(updateMember(chef, self.id, { roleId: adminRole.id })).rejects.toThrow(/propre rôle/);
    await expect(updateMember(chef, owner.id, { isActive: false })).rejects.toThrow();

    // Dans ses propres limites, il peut créer un profil et l'attribuer
    await saveRole(chef, null, { name: "Vendeur simple", permissions: ["sales.create", "sales.view"] });
    const vendeur = (await listMembers(chef)).roles.find((r) => r.name === "Vendeur simple")!;
    await addMember(chef, { fullName: "Vendeur", email: `v-${randomUUID()}@test.local`, password: "motdepasse123", roleId: vendeur.id });
  });

  it("le rôle Administrateur est verrouillé et un rôle utilisé ne peut pas être supprimé", async () => {
    const { admin } = await setup();
    const { roles } = await listMembers(admin);
    const adminRole = roles.find((r) => r.name === "Administrateur")!;
    await expect(saveRole(admin, adminRole.id, { name: "Administrateur", permissions: ["sales.create"] })).rejects.toThrow(/ne peut pas être modifié/);
    await expect(deleteRole(admin, roles.find((r) => r.name === "Caissier")!.id)).rejects.toThrow(/par défaut/);

    const id = await saveRole(admin, null, { name: "Stagiaire", permissions: ["products.view"] });
    await member(admin, "Stagiaire");
    await expect(deleteRole(admin, id)).rejects.toThrow(/attribué/);
    const unused = await saveRole(admin, null, { name: "Temporaire", permissions: ["products.view"] });
    await deleteRole(admin, unused);
    await expect(saveRole(admin, null, { name: "stagiaire", permissions: [] })).rejects.toThrow(/déjà ce nom/);
  });
});
