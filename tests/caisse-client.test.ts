import { describe, expect, it } from "vitest";
import { createCustomer, createCustomerFromPos, getCustomer, searchCustomersForPos } from "@/modules/customers/service";
import { createProduct } from "@/modules/products/service";
import { createSale, listPaymentMethods } from "@/modules/sales/service";
import { newCompany } from "./helpers";

describe("client en caisse", () => {
  it("recherche au fil de la frappe par nom ou par téléphone, quelle que soit la saisie des espaces", async () => {
    const ctx = await newCompany("Caisse Recherche");
    await createCustomer(ctx, { name: "Awa Traoré", phone: "07 12 34 56 78" });
    await createCustomer(ctx, { name: "Bakary Koné", phone: "+225 05 55 66 77" });

    expect((await searchCustomersForPos(ctx, "awa")).map((c) => c.name)).toEqual(["Awa Traoré"]);
    expect((await searchCustomersForPos(ctx, "0712345")).map((c) => c.name)).toEqual(["Awa Traoré"]);
    expect((await searchCustomersForPos(ctx, "05 55")).map((c) => c.name)).toEqual(["Bakary Koné"]);
    // sans saisie : les clients les plus récents
    expect(await searchCustomersForPos(ctx, "")).toHaveLength(2);
    // % et _ sont cherchés tels quels
    expect(await searchCustomersForPos(ctx, "%")).toHaveLength(0);
  });

  it("la recherche suffit de pouvoir vendre, sans consulter les fiches clients", async () => {
    const ctx = await newCompany("Caisse Droits");
    await createCustomer(ctx, { name: "Fatou", phone: "0101010101" });
    const vendeur = { ...ctx, permissions: ["sales.create"] };
    expect(await searchCustomersForPos(vendeur, "fat")).toHaveLength(1);
    await expect(searchCustomersForPos({ ...ctx, permissions: ["customers.view"] }, "fat")).rejects.toThrow(/Permission refusée/);
  });

  it("crée un client (nom + téléphone) depuis la caisse et le rattache à la vente", async () => {
    const ctx = await newCompany("Caisse Création");
    const c = await createCustomerFromPos(ctx, { name: "  Moussa Diallo ", phone: "07 00 11 22 33" });
    expect(c).toMatchObject({ name: "Moussa Diallo", phone: "07 00 11 22 33", balanceDue: 0 });

    const productId = await createProduct(ctx, { name: "Pagne", salePrice: 5000, initialStock: 10 });
    const [cash] = await listPaymentMethods(ctx, { excludeCredit: true });
    await createSale(ctx, { items: [{ productId, quantity: 2 }], customerId: c.id, payments: [{ paymentMethodId: cash.id, amount: 10000 }] });
    const fiche = await getCustomer(ctx, c.id);
    expect(fiche.sales).toHaveLength(1);
    expect(fiche.customer.totalSpent).toBe(10000);
  });

  it("exige « Ajouter des clients », un nom et un téléphone, et refuse un numéro déjà connu", async () => {
    const ctx = await newCompany("Caisse Validation");
    await expect(createCustomerFromPos({ ...ctx, permissions: ["sales.create", "customers.view"] }, { name: "X", phone: "0102030405" })).rejects.toThrow(/Permission refusée/);
    await expect(createCustomerFromPos(ctx, { name: "", phone: "0102030405" })).rejects.toThrow();
    await expect(createCustomerFromPos(ctx, { name: "Sans numéro", phone: "12" })).rejects.toThrow();
    await createCustomerFromPos({ ...ctx, permissions: ["sales.create", "customers.create"] }, { name: "Ibrahim", phone: "0102030405" });
    await expect(createCustomerFromPos(ctx, { name: "Autre", phone: "01 02 03 04 05" })).rejects.toThrow(/déjà celui de « Ibrahim »/);
  });

  it("isolation : une entreprise ne trouve ni n'utilise les clients d'une autre", async () => {
    const a = await newCompany("Caisse A");
    const b = await newCompany("Caisse B");
    const c = await createCustomerFromPos(a, { name: "Client de A", phone: "0799887766" });
    expect(await searchCustomersForPos(b, "Client de A")).toHaveLength(0);
    expect(await searchCustomersForPos(b, "0799887766")).toHaveLength(0);
    // le même numéro reste libre chez B
    await expect(createCustomerFromPos(b, { name: "Client de B", phone: "0799887766" })).resolves.toMatchObject({ name: "Client de B" });

    const productId = await createProduct(b, { name: "Savon", salePrice: 500, initialStock: 5 });
    const [cash] = await listPaymentMethods(b, { excludeCredit: true });
    await expect(createSale(b, { items: [{ productId, quantity: 1 }], customerId: c.id, payments: [{ paymentMethodId: cash.id, amount: 500 }] })).rejects.toThrow();
  });
});
