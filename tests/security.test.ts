import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, invoices, subscriptions, taxes, users } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { computeTotals } from "@/lib/money";
import { isOwnFileUrl, putFile } from "@/lib/storage";
import { loadContext, type AppContext } from "@/modules/auth/context";
import { AuthError, changePassword, login, signup } from "@/modules/auth/service";
import { createCustomer, recordCustomerPayment } from "@/modules/customers/service";
import { createExpense } from "@/modules/expenses/service";
import { createInvoiceFromSale, createManualInvoice, getPublicInvoice, recordInvoicePayment } from "@/modules/invoices/service";
import { createProduct, listProducts } from "@/modules/products/service";
import { createSale, posBootstrap } from "@/modules/sales/service";
import { recordManualMovement } from "@/modules/stock/service";
import { addMember, listMembers, resetMemberPassword } from "@/modules/users/service";
import { newCompany } from "./helpers";

async function company(name: string, opts: { allowNegativeStock?: boolean } = {}) {
  const ctx = await newCompany(name);
  await db.update(subscriptions).set({ planId: sql`(select id from plans where code = 'BUSINESS')` }).where(eq(subscriptions.companyId, ctx.companyId));
  if (opts.allowNegativeStock) {
    await db.update(companies).set({ allowNegativeStock: true }).where(eq(companies.id, ctx.companyId));
    ctx.company.allowNegativeStock = true;
  }
  const { paymentMethods } = await posBootstrap(ctx);
  return { ctx, cash: paymentMethods.find((p) => p.type === "cash")!, credit: paymentMethods.find((p) => p.type === "credit")! };
}

const ip = () => `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("encaissements", () => {
  it("refuse d'effacer une dette avec le moyen « Crédit »", async () => {
    const { ctx, cash, credit } = await company("Sécu Dette");
    const pid = await createProduct(ctx, { name: "Riz", salePrice: 1000, initialStock: 10 });
    const c = await createCustomer(ctx, { name: "Client dette" });
    await createSale(ctx, { items: [{ productId: pid, quantity: 1 }], customerId: c, payments: [{ paymentMethodId: credit.id, amount: 0 }] });
    await expect(recordCustomerPayment(ctx, { customerId: c, paymentMethodId: credit.id, amount: 1000 })).rejects.toThrow(/Moyen de paiement invalide/);
    expect(await recordCustomerPayment(ctx, { customerId: c, paymentMethodId: cash.id, amount: 1000 })).toBe(1000);

    const inv = await createManualInvoice(ctx, { customerId: c, items: [{ description: "Service", quantity: 1, unitPrice: 5000 }] });
    await expect(recordInvoicePayment(ctx, inv, credit.id, 5000)).rejects.toThrow(/Moyen de paiement invalide/);
    expect(await recordInvoicePayment(ctx, inv, cash.id, 5000)).toBe(5000);
  });
});

describe("identifiants d'une autre entreprise", () => {
  it("sont refusés partout où le navigateur les envoie", async () => {
    const a = await company("Sécu A");
    const b = await company("Sécu B");
    const pidA = await createProduct(a.ctx, { name: "P", salePrice: 100 });
    const pidB = await createProduct(b.ctx, { name: "PB", salePrice: 100 });
    const [taxB] = await withTenant(b.ctx, (tx) => tx.select({ id: taxes.id }).from(taxes).limit(1));
    await expect(recordManualMovement(a.ctx, { productId: pidA, kind: "in", quantity: 3, storeId: b.ctx.storeId })).rejects.toThrow(/Boutique/);
    await expect(createProduct(a.ctx, { name: "X", salePrice: 1, taxId: taxB.id })).rejects.toThrow(/Taxe/);
    await expect(createExpense(a.ctx, { category: "Loyer", amount: 1, spentOn: "2026-09-27", paymentMethodId: b.cash.id })).rejects.toThrow(/Moyen/);
    await expect(createManualInvoice(a.ctx, { customerName: "Y", items: [{ description: "Z", quantity: 1, unitPrice: 1, productId: pidB }] })).rejects.toThrow(/Produit/);
  });

  it("n'acceptent que des adresses de fichiers produites par le serveur pour l'entreprise", async () => {
    const { ctx } = await company("Sécu Fichiers");
    await expect(createExpense(ctx, { category: "Achat", amount: 1, spentOn: "2026-09-27", attachmentUrl: "https://evil.example/x" })).rejects.toThrow(/Justificatif/);
    await expect(createProduct(ctx, { name: "Img", salePrice: 1, imageUrl: "https://evil.example/a.png" })).rejects.toThrow(/Image/);
    const fake = new File([Buffer.from("<html><script>alert(1)</script>")], "x.png", { type: "image/png" });
    await expect(putFile(ctx.companyId, fake)).rejects.toThrow(/Format/);
    const png = new File([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], "x.png", { type: "application/octet-stream" });
    const url = await putFile(ctx.companyId, png, { private: true });
    expect(isOwnFileUrl(url, ctx.companyId, "private")).toBe(true);
    expect(isOwnFileUrl(url, randomUUID(), "private")).toBe(false);
    await createExpense(ctx, { category: "Achat", amount: 1, spentOn: "2026-09-27", attachmentUrl: url });
  });
});

describe("stock", () => {
  it("bloque la vente au-delà du stock, sauf si l'entreprise l'autorise", async () => {
    const strict = await company("Sécu Stock strict");
    const p = await createProduct(strict.ctx, { name: "Savon", salePrice: 500, initialStock: 2 });
    await expect(
      createSale(strict.ctx, { items: [{ productId: p, quantity: 3 }], payments: [{ paymentMethodId: strict.cash.id, amount: 1500 }] }),
    ).rejects.toThrow(/Stock insuffisant pour « Savon » : 2/);
    await expect(recordManualMovement(strict.ctx, { productId: p, kind: "out", quantity: 5 })).rejects.toThrow(/Stock insuffisant/);

    const loose = await company("Sécu Stock souple", { allowNegativeStock: true });
    const q = await createProduct(loose.ctx, { name: "Savon", salePrice: 500 });
    await createSale(loose.ctx, { items: [{ productId: q, quantity: 3 }], payments: [{ paymentMethodId: loose.cash.id, amount: 1500 }] });
  });

  it("borne une remise de ligne au montant de la ligne", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 1000, discount: 5000, taxRate: 0 }, { quantity: 1, unitPrice: 500, taxRate: 0 }], 0, 0);
    expect(t.total).toBe(500);
    expect(t.discountTotal).toBe(1000);
  });
});

describe("comptes et mots de passe", () => {
  it("ne rattache jamais un compte existant et impose le changement du mot de passe provisoire", async () => {
    const { ctx: admin } = await company("Sécu Comptes");
    const other = await newCompany("Sécu Autre");
    const { roles } = await listMembers(admin);
    const caissier = roles.find((r) => r.name === "Caissier")!;
    await expect(addMember(admin, { fullName: "Victime", email: other.user.email, password: "motdepasse123", roleId: caissier.id })).rejects.toThrow(/déjà un compte/);

    const email = `emp-${randomUUID()}@test.local`;
    const userId = await addMember(admin, { fullName: "Employé", email, password: "provisoire123", roleId: caissier.id });
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.mustChangePassword).toBe(true);

    const first = await login({ email, password: "provisoire123" }, { ip: ip() });
    await expect(changePassword({ userId, companyId: first.companyId }, { current: "faux", next: "personnel456", confirm: "personnel456" }, first.session.token)).rejects.toThrow(/actuel incorrect/);
    await changePassword({ userId, companyId: first.companyId }, { current: "provisoire123", next: "personnel456", confirm: "personnel456" }, first.session.token);
    const [after] = await db.select().from(users).where(eq(users.id, userId));
    expect(after.mustChangePassword).toBe(false);
    await login({ email, password: "personnel456" }, { ip: ip() });

    // Réinitialisation par l'administrateur : nouveau provisoire, à changer de nouveau
    const member = (await listMembers(admin)).members.find((m) => m.userId === userId)!;
    const temporary = await resetMemberPassword(admin, member.id);
    await expect(login({ email, password: "personnel456" }, { ip: ip() })).rejects.toThrow(AuthError);
    await login({ email, password: temporary }, { ip: ip() });
    const [reset] = await db.select().from(users).where(eq(users.id, userId));
    expect(reset.mustChangePassword).toBe(true);
    const owner = (await listMembers(admin)).members.find((m) => m.isOwner)!;
    await expect(resetMemberPassword(admin, owner.id)).rejects.toThrow();

    const ctx = await loadContext({ userId, fullName: "Employé", email, isSuperAdmin: false, mustChangePassword: true }, admin.companyId);
    expect((ctx as AppContext).user.mustChangePassword).toBe(true);
  });

  it("limite les essais sur un compte, même depuis des IP différentes", async () => {
    const { ctx } = await company("Sécu Force brute");
    const email = ctx.user.email;
    for (let i = 0; i < 20; i++) await expect(login({ email, password: "faux" }, { ip: ip() })).rejects.toThrow(/incorrect/);
    await expect(login({ email, password: "motdepasse123" }, { ip: ip() })).rejects.toThrow(/Trop de tentatives/);
  }, 30_000);

  it("limite les inscriptions par IP", async () => {
    const addr = ip();
    for (let i = 0; i < 5; i++) {
      await signup({ companyName: `Spam ${i}`, ownerName: "Spam", email: `spam-${randomUUID()}@test.local`, password: "motdepasse123" }, { ip: addr });
    }
    await expect(signup({ companyName: "Spam 6", ownerName: "Spam", email: `spam-${randomUUID()}@test.local`, password: "motdepasse123" }, { ip: addr })).rejects.toThrow(/Trop d'inscriptions/);
  }, 30_000);
});

describe("divers", () => {
  it("les jokers % et _ d'une recherche ne ramènent pas tout le catalogue", async () => {
    const { ctx } = await company("Sécu Recherche");
    await createProduct(ctx, { name: "Ciment", salePrice: 1 });
    await createProduct(ctx, { name: "Remise 50% été", salePrice: 1 });
    expect((await listProducts(ctx, { q: "%" })).rows.map((r) => r.name)).toEqual(["Remise 50% été"]);
  });

  it("masque la facture publique d'une entreprise suspendue", async () => {
    const { ctx, cash } = await company("Sécu Suspendue");
    const p = await createProduct(ctx, { name: "Pain", salePrice: 200, initialStock: 5 });
    const s = await createSale(ctx, { items: [{ productId: p, quantity: 1 }], payments: [{ paymentMethodId: cash.id, amount: 200 }] });
    const invId = await createInvoiceFromSale(ctx, s.id);
    const [{ token }] = await withTenant(ctx, (tx) => tx.select({ token: invoices.publicToken }).from(invoices).where(eq(invoices.id, invId)));
    expect(await getPublicInvoice(token)).not.toBeNull();
    await db.update(companies).set({ status: "suspended" }).where(eq(companies.id, ctx.companyId));
    expect(await getPublicInvoice(token)).toBeNull();
  });
});
