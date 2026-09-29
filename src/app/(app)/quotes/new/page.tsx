import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { localDate } from "@/lib/dates";
import { currencyDecimals, isTaxMode } from "@/lib/money";
import { customerOptions } from "@/modules/customers/service";
import { productFormOptions } from "@/modules/products/service";
import { addDays, QUOTE_VALIDITY_DAYS } from "@/modules/quotes/labels";

export const metadata = { title: "Nouvelle proforma" };

export default async function NewQuotePage() {
  const ctx = await requireContext("quotes.create");
  const [customers, { taxes }] = await Promise.all([customerOptions(ctx).catch(() => []), productFormOptions(ctx)]);
  const validUntil = addDays(localDate(new Date(), ctx.company.timezone), QUOTE_VALIDITY_DAYS);
  return (
    <>
      <PageHeader title="Nouvelle proforma" subtitle="Chiffrage à envoyer au client. Ce n'est pas une facture : aucun stock ni créance ne bouge." />
      <DocumentEditor
        kind="quote"
        customers={customers}
        taxes={taxes}
        currency={ctx.company.currency}
        decimals={currencyDecimals(ctx.company.currency)}
        taxMode={isTaxMode(ctx.company.taxMode) ? ctx.company.taxMode : "line"}
        initial={{ customerId: null, customerName: null, validUntil, conditions: null, notes: null, discount: 0, rows: [] }}
      />
    </>
  );
}
