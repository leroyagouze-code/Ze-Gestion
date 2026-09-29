import { notFound, redirect } from "next/navigation";
import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { NotFoundError } from "@/lib/errors";
import { currencyDecimals, isTaxMode } from "@/lib/money";
import { customerOptions } from "@/modules/customers/service";
import { productFormOptions } from "@/modules/products/service";
import { getQuote } from "@/modules/quotes/service";

export const metadata = { title: "Modifier la proforma" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("quotes.create");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { quote: q, items } = await getQuote(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (q.status === "converted" || q.status === "accepted") {
    redirect(`/quotes/${q.id}?erreur=${encodeURIComponent(q.status === "accepted" ? "Proforma acceptée : rouvrez-la avant de la modifier" : "Proforma déjà convertie en facture")}`);
  }
  const [customers, { taxes }] = await Promise.all([customerOptions(ctx).catch(() => []), productFormOptions(ctx)]);
  const bump = q.status !== "draft";
  return (
    <>
      <PageHeader title={`Modifier la proforma ${q.number}`} subtitle={q.revision > 1 ? `Révision actuelle : ${q.revision}` : undefined} />
      <DocumentEditor
        kind="quote"
        customers={customers}
        taxes={taxes}
        currency={ctx.company.currency}
        decimals={currencyDecimals(ctx.company.currency)}
        taxMode={isTaxMode(q.taxMode) ? q.taxMode : "line"}
        initial={{
          id: q.id,
          number: q.number,
          willBumpRevision: bump,
          nextRevision: q.revision + 1,
          customerId: q.customerId,
          customerName: q.customerSnapshot?.name ?? null,
          validUntil: q.validUntil,
          conditions: q.conditions,
          notes: q.notes,
          discount: q.globalDiscount,
          rows: items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), taxRate: String(i.taxRate) })),
        }}
      />
    </>
  );
}
