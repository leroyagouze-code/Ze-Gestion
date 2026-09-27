import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { currencyDecimals } from "@/lib/money";
import { productFormOptions } from "@/modules/products/service";
import { customerOptions } from "@/modules/customers/service";
import { InvoiceEditor } from "./editor";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage() {
  const ctx = await requireContext("invoices.create");
  const [customers, { taxes }] = await Promise.all([customerOptions(ctx).catch(() => []), productFormOptions(ctx)]);
  return (
    <>
      <PageHeader title="Nouvelle facture" subtitle="Facture manuelle (sans sortie de stock). Pour une vente en boutique, passez par la caisse." />
      <InvoiceEditor customers={customers} taxes={taxes} currency={ctx.company.currency} decimals={currencyDecimals(ctx.company.currency)} />
    </>
  );
}
