import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loadContext } from "@/modules/auth/context";
import { signup } from "@/modules/auth/service";
import { createCustomer } from "@/modules/customers/service";
import { createProduct } from "@/modules/products/service";
import { createSale, listPaymentMethods } from "@/modules/sales/service";
import { createSupplier } from "@/modules/suppliers/service";

/** Données de démonstration : entreprise, produits, clients, ventes. Compte : demo@gestion.local / demo12345 */
async function main() {
  // Le compte de démo est aussi super admin : jamais sur un serveur de production.
  if (process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://")) {
    console.error("Refusé : les données de démo (avec un super admin au mot de passe connu) ne se chargent pas en production.");
    process.exit(1);
  }
  const email = process.env.SEED_EMAIL ?? "demo@gestion.local";
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) {
    console.log("Données de démo déjà présentes.");
    process.exit(0);
  }
  const res = await signup({
    companyName: "Boutique Démo Lomé",
    ownerName: "Koffi Démo",
    email,
    password: process.env.SEED_PASSWORD ?? "demo12345",
    phone: "+228 90 00 00 00",
    address: "Boulevard du 13 Janvier",
    city: "Lomé",
  });
  await db.update(users).set({ isSuperAdmin: true, emailVerifiedAt: new Date() }).where(eq(users.id, res.userId));
  const ctx = (await loadContext({ userId: res.userId, fullName: "Koffi Démo", email, isSuperAdmin: true }, res.companyId))!;

  const sup = await createSupplier(ctx, { name: "Grossiste Adjamé", phone: "+228 91 11 11 11" });
  const catalog: [string, string, number, number, number, string][] = [
    ["Riz parfumé 25 kg", "Alimentation", 16500, 18500, 40, "sac"],
    ["Huile végétale 1 L", "Alimentation", 1100, 1500, 120, "pièce"],
    ["Sucre en morceaux 1 kg", "Alimentation", 700, 900, 80, "pièce"],
    ["Lait concentré sucré", "Alimentation", 450, 600, 200, "pièce"],
    ["Savon de Marseille", "Hygiène", 300, 500, 150, "pièce"],
    ["Eau minérale 1,5 L", "Boissons", 250, 400, 300, "pièce"],
    ["Coca-Cola 33 cl", "Boissons", 300, 500, 6, "pièce"],
    ["Spaghetti 500 g", "Alimentation", 400, 600, 90, "pièce"],
    ["Tomate concentrée 400 g", "Alimentation", 500, 750, 3, "pièce"],
    ["Recharge crédit 1000", "Services", 950, 1000, 0, "pièce"],
  ];
  const ids: string[] = [];
  for (const [i, [name, cat, buy, sell, stock, unit]] of catalog.entries()) {
    ids.push(
      await createProduct(ctx, {
        name,
        categoryName: cat,
        purchasePrice: buy,
        salePrice: sell,
        initialStock: stock,
        unit,
        minStock: 10,
        sku: `P${String(i + 1).padStart(4, "0")}`,
        barcode: `600000000${String(i + 1).padStart(4, "0")}`,
        supplierId: sup,
      }),
    );
  }
  const ama = await createCustomer(ctx, { name: "Ama Mensah", phone: "+228 92 22 22 22", whatsapp: "+228 92 22 22 22" });
  await createCustomer(ctx, { name: "Restaurant Le Palmier", companyName: "Le Palmier SARL", phone: "+228 93 33 33 33" });
  const pms = await listPaymentMethods(ctx);
  const cash = pms.find((p) => p.type === "cash")!;
  const tmoney = pms.find((p) => p.label === "TMoney")!;
  await createSale(ctx, { items: [{ productId: ids[0], quantity: 1 }, { productId: ids[1], quantity: 3 }], payments: [{ paymentMethodId: cash.id, amount: 25000 }] });
  await createSale(ctx, { items: [{ productId: ids[5], quantity: 12 }], payments: [{ paymentMethodId: tmoney.id, amount: 4800, reference: "TM123456" }] });
  await createSale(ctx, { items: [{ productId: ids[4], quantity: 10 }, { productId: ids[2], quantity: 5 }], customerId: ama, payments: [{ paymentMethodId: cash.id, amount: 5000 }] });
  console.log(`Démo prête : ${email} / ${process.env.SEED_PASSWORD ?? "demo12345"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
