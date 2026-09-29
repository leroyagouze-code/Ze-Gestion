import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products, sales } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { createProduct } from "@/modules/products/service";
import { createSale, posBootstrap } from "@/modules/sales/service";
import { listMovements, recordManualMovement, weightedAverageCost } from "@/modules/stock/service";
import { createSupplier, getSupplier } from "@/modules/suppliers/service";
import { newCompany } from "./helpers";

async function productCost(ctx: Awaited<ReturnType<typeof newCompany>>, id: string) {
  const [p] = await withTenant(ctx, (tx) => tx.select({ cost: products.purchasePrice, supplierId: products.supplierId }).from(products).where(eq(products.id, id)));
  return p;
}

describe("entrée de stock avec prix d'achat et fournisseur", () => {
  it("calcule le coût moyen pondéré", () => {
    expect(weightedAverageCost(10, 1000, 10, 1200, 0)).toBe(1100);
    // stock négatif ou nul : le nouveau prix s'applique tel quel
    expect(weightedAverageCost(-3, 1000, 5, 1200, 0)).toBe(1200);
    expect(weightedAverageCost(0, 0, 4, 999.555, 2)).toBe(999.56);
  });

  it("met à jour le CMP du produit, garde le fournisseur sur le mouvement et sert la marge", async () => {
    const ctx = await newCompany("Entrée Stock");
    const supplierId = await createSupplier(ctx, { name: "Grossiste Adjamé" });
    const pid = await createProduct(ctx, { name: "Riz 5kg", salePrice: 5000, purchasePrice: 1000, initialStock: 10 });

    await recordManualMovement(ctx, { productId: pid, kind: "in", quantity: "10", unitCost: "1200", supplierId, reason: "BL 42" });
    let p = await productCost(ctx, pid);
    expect(p.cost).toBe(1100);
    // premier fournisseur connu : devient le fournisseur habituel du produit
    expect(p.supplierId).toBe(supplierId);

    await recordManualMovement(ctx, { productId: pid, kind: "in", quantity: 5, unitCost: 1150 });
    p = await productCost(ctx, pid);
    expect(p.cost).toBe(1110); // (20 × 1100 + 5 × 1150) / 25

    // entrée sans prix : le coût ne bouge pas
    await recordManualMovement(ctx, { productId: pid, kind: "in", quantity: 5, unitCost: "", supplierId: "" });
    expect((await productCost(ctx, pid)).cost).toBe(1110);

    const { rows } = await listMovements(ctx, { productId: pid });
    const receipt = rows.find((r) => r.reason === "BL 42")!;
    expect(receipt).toMatchObject({ type: "in", quantity: 10, unitCost: 1200, supplierId, supplierName: "Grossiste Adjamé" });

    const detail = await getSupplier(ctx, supplierId);
    expect(detail.receipts.some((r) => r.unitCost === 1200)).toBe(true);

    // la vente suivante coûte au CMP
    const { paymentMethods: pms } = await posBootstrap(ctx);
    const cash = pms.find((m) => m.label === "Espèces")!;
    const sale = await createSale(ctx, { items: [{ productId: pid, quantity: 2 }], payments: [{ paymentMethodId: cash.id, amount: 10000 }] });
    const [s] = await withTenant(ctx, (tx) => tx.select({ costTotal: sales.costTotal }).from(sales).where(eq(sales.id, sale.id)));
    expect(s.costTotal).toBe(2220);
  });

  it("refuse le fournisseur d'une autre entreprise et le prix sur une sortie", async () => {
    const a = await newCompany("Entreprise A");
    const b = await newCompany("Entreprise B");
    const foreign = await createSupplier(b, { name: "Fournisseur de B" });
    const pid = await createProduct(a, { name: "Sucre", salePrice: 800, purchasePrice: 500, initialStock: 4 });

    await expect(recordManualMovement(a, { productId: pid, kind: "in", quantity: 1, unitCost: 600, supplierId: foreign })).rejects.toThrow(/Fournisseur/);
    await expect(recordManualMovement(a, { productId: pid, kind: "out", quantity: 1, unitCost: 600 })).rejects.toThrow(/entrée/);
    // rien n'a bougé
    expect(await productCost(a, pid)).toEqual({ cost: 500, supplierId: null });
  });

  it("ignore le prix saisi sans le droit de voir les coûts", async () => {
    const ctx = await newCompany("Sans coûts");
    const pid = await createProduct(ctx, { name: "Thé", salePrice: 300, purchasePrice: 200, initialStock: 2 });
    const limited = { ...ctx, permissions: ctx.permissions.filter((x) => x !== "products.cost") };
    await recordManualMovement(limited as typeof ctx, { productId: pid, kind: "in", quantity: 2, unitCost: 10000 });
    expect((await productCost(ctx, pid)).cost).toBe(200);
    const { rows } = await listMovements(limited as typeof ctx, { productId: pid });
    expect(rows.every((r) => r.unitCost === null)).toBe(true);
  });
});
