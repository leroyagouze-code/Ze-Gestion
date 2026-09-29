import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { importProducts, getProduct, normalizeProductName } from "@/modules/products/service";
import { newCompany } from "./helpers";

const csv = (text: string) => Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, delimiter: ";" }).data;

const FICHIER = `
nom;reference;sku;code_barres;categorie;prix_achat;prix_vente;stock_initial
Riz parfumé 5kg;;;6001234567890;Épicerie;3000;4500;10
Huile 1L;;HUI-1L;;Épicerie;900;1200;5
Savon Crème;;;;Hygiène;200;350;20
`;

async function activeProducts(ctx: Awaited<ReturnType<typeof newCompany>>) {
  return withTenant(ctx, (tx) => tx.select().from(products).where(eq(products.isActive, true)));
}

describe("import CSV des produits", () => {
  it("normalise les noms (casse, accents, espaces)", () => {
    expect(normalizeProductName("  Savon   CRÈME ")).toBe(normalizeProductName("savon creme"));
  });

  it("réimporter le même fichier met à jour au lieu de dupliquer, sans toucher au stock", async () => {
    const ctx = await newCompany("Import Test");
    const first = await importProducts(ctx, csv(FICHIER));
    expect(first).toMatchObject({ created: 3, updated: 0, skipped: 0 });

    const second = await importProducts(ctx, csv(FICHIER.replace("4500", "4800")));
    expect(second).toMatchObject({ created: 0, updated: 3, skipped: 0 });

    const rows = await activeProducts(ctx);
    expect(rows).toHaveLength(3);
    const riz = rows.find((p) => p.barcode === "6001234567890")!;
    expect(riz.salePrice).toBe(4800);
    // stock_initial n'est appliqué qu'à la création
    expect((await getProduct(ctx, riz.id)).stock).toBe(10);
  });

  it("correspondance par code-barres, SKU puis nom normalisé", async () => {
    const ctx = await newCompany("Import Match");
    await importProducts(ctx, csv(FICHIER));
    const r = await importProducts(
      ctx,
      csv(`
nom;sku;code_barres;prix_vente
Riz renommé;;6001234567890;4600
Huile tournesol 1L;HUI-1L;;1300
  savon   CREME ;;;400
Nouveau produit;;;100
`),
    );
    expect(r).toMatchObject({ created: 1, updated: 3, skipped: 0 });
    const rows = await activeProducts(ctx);
    expect(rows).toHaveLength(4);
    expect(rows.find((p) => p.barcode === "6001234567890")!.name).toBe("Riz renommé");
    expect(rows.find((p) => p.sku === "HUI-1L")!.salePrice).toBe(1300);
    // prix_achat absent du fichier : le coût existant est conservé
    expect(rows.find((p) => p.sku === "HUI-1L")!.purchasePrice).toBe(900);
  });

  it("un doublon dans le même fichier ne crée qu'un produit", async () => {
    const ctx = await newCompany("Import Doublon");
    const r = await importProducts(
      ctx,
      csv(`
nom;code_barres;prix_vente
Sucre 1kg;3001;800
Lait;;500
Sucre en poudre;3001;850
LAIT ;;550
`),
    );
    expect(r).toMatchObject({ created: 2, updated: 0, skipped: 2 });
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(await activeProducts(ctx)).toHaveLength(2);
  });

  it("un nom identique mais un code-barres différent reste un produit distinct", async () => {
    const ctx = await newCompany("Import Variantes");
    const r = await importProducts(
      ctx,
      csv(`
nom;code_barres;prix_vente
Coca-Cola;111;500
Coca-Cola;222;500
`),
    );
    expect(r).toMatchObject({ created: 2, skipped: 0 });
  });
});
