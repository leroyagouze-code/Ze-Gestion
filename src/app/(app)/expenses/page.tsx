import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, EmptyState, Field, PageHeader, Pagination, SelectField, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate, localDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { EXPENSE_CATEGORIES, listExpenses } from "@/modules/expenses/service";
import { listPaymentMethods } from "@/modules/sales/service";
import { createExpenseAction, deleteExpenseAction } from "./actions";

export const metadata = { title: "Dépenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireContext("expenses.view");
  const sp = await searchParams;
  const data = await listExpenses(ctx, { page: Number(sp.page) });
  const canEdit = can(ctx.permissions, "expenses.edit");
  const methods = canEdit ? await listPaymentMethods(ctx, { excludeCredit: true }) : [];
  return (
    <>
      <PageHeader title="Dépenses" />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="card">
            {data.rows.length === 0 ? (
              <EmptyState title="Aucune dépense" />
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Catégorie</th><th className="hidden md:table-cell">Description</th><th className="text-right">Montant</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDate(e.spentOn)}</td>
                        <td>
                          {e.category}
                          {e.method && <div className="text-xs text-slate-500">{e.method}</div>}
                          {e.attachmentUrl && <a href={e.attachmentUrl} target="_blank" className="text-xs text-brand-700 hover:underline">Justificatif</a>}
                        </td>
                        <td className="hidden md:table-cell">{e.description}</td>
                        <td className="text-right">{formatMoney(e.amount, ctx.company.currency)}</td>
                        <td className="text-right">
                          {canEdit && (
                            <form action={deleteExpenseAction.bind(null, e.id)}>
                              <ConfirmButton message="Supprimer cette dépense ?" className="px-2 py-1 text-sm text-red-600 hover:underline">Supprimer</ConfirmButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </div>
          <Pagination page={data.page} total={data.total} pageSize={data.pageSize} />
        </div>
        {canEdit && (
          <Card title="Nouvelle dépense">
            <ActionForm action={createExpenseAction} className="space-y-3" resetOnSuccess>
              <SelectField label="Catégorie" name="category" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              <Field label="Montant" name="amount" inputMode="decimal" required />
              <Field label="Date" name="spentOn" type="date" defaultValue={localDate(new Date())} required />
              <SelectField label="Mode de paiement" name="paymentMethodId" placeholder="—" options={methods.map((p) => ({ value: p.id, label: p.label }))} />
              <Field label="Description" name="description" />
              <div>
                <label className="label" htmlFor="attachment">Pièce justificative</label>
                <input id="attachment" name="attachment" type="file" accept="image/*,application/pdf" className="input" />
              </div>
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
