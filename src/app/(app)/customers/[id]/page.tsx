import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, SelectField, Stat } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getCustomer } from "@/modules/customers/service";
import { INVOICE_STATUS } from "@/modules/invoices/labels";
import { listPaymentMethods } from "@/modules/sales/service";
import { customerPaymentAction, updateCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("customers.view");
  const { id } = await params;
  const data = await getCustomer(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const c = data.customer;
  const m = (v: number) => formatMoney(v, ctx.company.currency);
  const canPay = can(ctx.permissions, "sales.create") && c.balanceDue > 0;
  const methods = canPay ? await listPaymentMethods(ctx, { excludeCredit: true }) : [];
  const wa = (c.whatsapp || c.phone)?.replace(/[^\d]/g, "");
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.companyName, c.phone, c.email].filter(Boolean).join(" · ") || undefined}
        actions={wa ? <a className="btn-secondary" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : undefined}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total dépensé" value={m(c.totalSpent)} />
        <Stat label="Solde dû" value={m(c.balanceDue)} tone={c.balanceDue > 0 ? "warn" : "default"} />
        <Stat label="Achats" value={data.sales.length} />
        <Stat label="Factures" value={data.invoices.length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Achats">
            {data.sales.length === 0 ? <p className="text-sm text-slate-500">Aucun achat.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    {data.sales.map((s) => (
                      <tr key={s.id}>
                        <td><Link href={`/sales/${s.id}`} className="font-medium hover:text-brand-700">{s.number}</Link></td>
                        <td>{formatDate(s.createdAt, true)}</td>
                        <td className="text-right">{m(s.total)}</td>
                        <td className="text-right">{s.status === "cancelled" ? <Badge tone="gray">Annulée</Badge> : s.dueAmount > 0 ? <Badge tone="amber">Reste {m(s.dueAmount)}</Badge> : <Badge tone="green">Payée</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Factures">
            {data.invoices.length === 0 ? <p className="text-sm text-slate-500">Aucune facture.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.id}>
                        <td><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand-700">{i.number}</Link></td>
                        <td>{formatDate(i.issueDate)}</td>
                        <td className="text-right">{m(i.total)}</td>
                        <td className="text-right"><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Paiements">
            {data.payments.length === 0 ? <p className="text-sm text-slate-500">Aucun paiement.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{formatDate(p.createdAt, true)}</td>
                        <td>{p.method}</td>
                        <td className="text-right">{m(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {canPay && (
            <Card title="Encaisser une créance">
              <ActionForm action={customerPaymentAction} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="customerId" value={c.id} />
                <Field label="Montant" name="amount" inputMode="decimal" defaultValue={c.balanceDue} required />
                <SelectField label="Moyen de paiement" name="paymentMethodId" options={methods.map((p) => ({ value: p.id, label: p.label }))} />
                <Field label="Référence" name="reference" placeholder="N° transaction TMoney, Flooz…" />
                <SubmitButton>Enregistrer le paiement</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {can(ctx.permissions, "customers.edit") && (
            <Card title="Fiche client">
              <CustomerForm action={updateCustomerAction.bind(null, c.id)} c={c} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
