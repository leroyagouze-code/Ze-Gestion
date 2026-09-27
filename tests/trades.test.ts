import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db/tenant";
import { invoices, stockLevels } from "@/db/schema";
import { attributeSummary, getTrade } from "@/lib/trades";
import { createProduct, getProduct, listProducts, searchForPos, updateProduct } from "@/modules/products/service";
import {
  addRepairItem,
  createRepairOrder,
  getRepairOrder,
  invoiceRepairOrder,
  listRepairOrders,
  removeRepairItem,
} from "@/modules/repairs/service";
import { newCompany } from "./helpers";

describe("métiers", () => {
  it("garde le métier choisi à l'inscription", async () => {
    const ctx = await newCompany("Garage Test", "garage");
    expect(ctx.company.businessType).toBe("garage");
    expect(getTrade(ctx.company.businessType).item.many).toBe("Pièces");
    expect(getTrade("inconnu").label).toBe("Commerce général");
  });

  it("boutique : taille et couleur sur la fiche, retrouvées par la recherche", async () => {
    const ctx = await newCompany("Mode Test", "retail");
    const id = await createProduct(ctx, { name: "Chemise lin", salePrice: 12000, attributes: { size: "M", color: "Blanc", inconnu: "x" } });
    const p = (await getProduct(ctx, id)).product;
    expect(p.attributes).toEqual({ size: "M", color: "Blanc" });
    expect(attributeSummary(getTrade("retail"), p.attributes)).toBe("M · Blanc");
    expect((await listProducts(ctx, { q: "blanc" })).rows.map((r) => r.id)).toEqual([id]);
    // Une modification sans champs du métier les conserve
    await updateProduct(ctx, id, { name: "Chemise lin", salePrice: 13000 });
    expect((await getProduct(ctx, id)).product.attributes).toEqual({ size: "M", color: "Blanc" });
  });

  it("concessionnaire : numéro de châssis obligatoire et unique, trouvé en caisse", async () => {
    const ctx = await newCompany("Auto Test", "dealer");
    await expect(createProduct(ctx, { name: "Toyota Corolla", salePrice: 9_000_000, attributes: { vin: "" } })).rejects.toThrow(/châssis/);
    const id = await createProduct(ctx, { name: "Toyota Corolla", salePrice: 9_000_000, initialStock: 1, attributes: { vin: "jtdbr32e 530123456", model: "Corolla", year: "2021" } });
    expect((await getProduct(ctx, id)).product.attributes.vin).toBe("JTDBR32E530123456");
    await expect(createProduct(ctx, { name: "Autre", salePrice: 1, attributes: { vin: "JTDBR32E530123456" } })).rejects.toThrow(/existe déjà/);
    expect((await searchForPos(ctx, "jtdbr32e530123456")).map((p) => p.id)).toEqual([id]);
    // Même VIN dans une autre entreprise : permis
    const other = await newCompany("Auto 2", "dealer");
    await createProduct(other, { name: "Corolla", salePrice: 1, attributes: { vin: "JTDBR32E530123456" } });
  });

  it("garage : ordre de réparation, pièces et main-d'œuvre, facture et sortie de stock", async () => {
    const ctx = await newCompany("Garage Atelier", "garage");
    const part = await createProduct(ctx, { name: "Plaquettes avant", salePrice: 15000, initialStock: 4, attributes: { oemRef: "04465-0K240" } });
    const id = await createRepairOrder(ctx, { customerName: "Kodjo", customerPhone: "+228 90 11 22 33", plate: "tg-1234 ab", brand: "Toyota", model: "Hilux", mileage: "120000", complaint: "Freins qui grincent" });
    await addRepairItem(ctx, id, { kind: "part", productId: part, quantity: "2" });
    await addRepairItem(ctx, id, { kind: "labor", description: "Remplacement plaquettes", quantity: "1,5", unitPrice: "10000" });
    const tmp = await getRepairOrder(ctx, id);
    await addRepairItem(ctx, id, { kind: "labor", description: "À retirer", quantity: 1, unitPrice: 1 });
    const extra = (await getRepairOrder(ctx, id)).items.find((i) => i.description === "À retirer")!;
    await removeRepairItem(ctx, id, extra.id);

    const o = await getRepairOrder(ctx, id);
    expect(o.vehicle.plate).toBe("TG1234AB");
    expect(o.order.status).toBe("in_progress");
    expect(o.totals).toEqual({ parts: 30000, labor: 15000, total: 45000 });
    expect(tmp.items).toHaveLength(2);

    const invoiceId = await invoiceRepairOrder(ctx, id);
    const [inv] = await withTenant(ctx, (tx) => tx.select().from(invoices).where(eq(invoices.id, invoiceId)));
    expect(inv.total).toBe(45000);
    expect(inv.notes).toContain(o.order.number);
    const [lvl] = await withTenant(ctx, (tx) => tx.select().from(stockLevels).where(eq(stockLevels.productId, part)));
    expect(lvl.quantity).toBe(2);
    // Facturé : verrouillé
    await expect(addRepairItem(ctx, id, { kind: "labor", description: "x", quantity: 1, unitPrice: 1 })).rejects.toThrow(/facturé/);
    await expect(invoiceRepairOrder(ctx, id)).rejects.toThrow(/facturé/);

    // Deuxième passage : le véhicule est reconnu par son immatriculation
    const id2 = await createRepairOrder(ctx, { customerId: o.customer.id, plate: "TG 1234 AB", complaint: "Vidange" });
    const o2 = await getRepairOrder(ctx, id2);
    expect(o2.vehicle.id).toBe(o.vehicle.id);
    expect(o2.vehicle.model).toBe("Hilux");
    expect(o2.history.map((h) => h.id)).toEqual([id]);
    expect((await listRepairOrders(ctx, { q: "1234" })).rows.map((r) => r.id)).toEqual([id2]);
    expect((await listRepairOrders(ctx, { q: "1234", status: "all" })).total).toBe(2);
  });

  it("garage : pas de facture sans ligne, stock insuffisant refusé", async () => {
    const ctx = await newCompany("Garage Vide", "garage");
    const id = await createRepairOrder(ctx, { customerName: "Ama", plate: "AB-12" });
    await expect(invoiceRepairOrder(ctx, id)).rejects.toThrow(/au moins une/);
    const part = await createProduct(ctx, { name: "Filtre", salePrice: 5000, initialStock: 1 });
    await addRepairItem(ctx, id, { kind: "part", productId: part, quantity: 3 });
    await expect(invoiceRepairOrder(ctx, id)).rejects.toThrow(/Stock insuffisant/);
    expect((await getRepairOrder(ctx, id)).order.status).toBe("in_progress");
  });

  it("isole les véhicules et ordres entre entreprises", async () => {
    const a = await newCompany("Garage A", "garage");
    const b = await newCompany("Garage B", "garage");
    const id = await createRepairOrder(a, { customerName: "X", plate: "ZZ-99" });
    await expect(getRepairOrder(b, id)).rejects.toThrow(/introuvable/);
    expect((await listRepairOrders(b, { status: "all" })).total).toBe(0);
  });
});
