import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { assertCorrectable, getInvoice } from "@/modules/invoices/service";
import { requireContext } from "@/lib/auth/server";
import { currencyDecimals, isTaxMode } from "@/lib/money";
import { productFormOptions } from "@/modules/products/service";
import { customerOptions } from "@/modules/customers/service";
import { InvoiceEditor } from "./editor";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ corrige?: string }> }) {
  const ctx = await requireContext("invoices.create");
  const { corrige } = await searchParams;
  const [customers, { taxes }] = await Promise.all([customerOptions(ctx).catch(() => []), productFormOptions(ctx)]);
  let initial;
  if (corrige && /^[0-9a-f-]{36}$/.test(corrige) && can(ctx.permissions, "invoices.cancel")) {
    const { invoice: inv, items } = await getInvoice(ctx, corrige);
    const reason = (() => {
      try {
        assertCorrectable(inv);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    })();
    if (reason) redirect(`/invoices/${inv.id}?erreur=${encodeURIComponent(reason)}`);
    initial = {
      replacesId: inv.id,
      number: inv.number,
      customerId: inv.customerId,
      customerName: inv.customerSnapshot?.name ?? null,
      dueDate: inv.dueDate,
      paymentTerms: inv.paymentTerms,
      notes: (inv.notes ?? "").split("\n").filter((l) => !l.startsWith("Remplace la facture ")).join("\n") || null,
      rows: items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), taxRate: String(i.taxRate) })),
    };
  }
  return (
    <>
      <PageHeader
        title={initial ? `Corriger la facture ${initial.number}` : "Nouvelle facture"}
        subtitle="Facture manuelle (sans sortie de stock). Pour une vente en boutique, passez par la caisse."
      />
      <InvoiceEditor customers={customers} taxes={taxes} currency={ctx.company.currency} decimals={currencyDecimals(ctx.company.currency)} taxMode={isTaxMode(ctx.company.taxMode) ? ctx.company.taxMode : "line"} initial={initial} />
    </>
  );
}
