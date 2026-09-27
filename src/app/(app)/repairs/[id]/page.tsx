import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, SelectField, TableWrap, TextArea } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatQty, priceBasis } from "@/lib/money";
import { can } from "@/lib/permissions";
import { attributeSummary, getTrade } from "@/lib/trades";
import { getRepairOrder, partOptions, REPAIR_STATUS } from "@/modules/repairs/service";
import { addRepairItemAction, invoiceRepairAction, removeRepairItemAction, setRepairStatusAction, updateRepairAction } from "../actions";

export default async function RepairPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext("sales.view");
  const { id } = await params;
  const data = await getRepairOrder(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { order: o, customer: c, vehicle: v, items, totals, history } = data;
  const editable = can(ctx.permissions, "sales.create") && o.status !== "invoiced" && o.status !== "cancelled";
  const parts = editable ? await partOptions(ctx) : [];
  const trade = getTrade(ctx.company.businessType);
  const m = (n: number) => formatMoney(n, ctx.company.currency);
  const st = REPAIR_STATUS[o.status];
  return (
    <>
      <PageHeader
        title={`Ordre ${o.number}`}
        subtitle={`Ouvert le ${formatDate(o.createdAt)}${o.promisedAt ? ` · promis pour le ${formatDate(o.promisedAt)}` : ""}`}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {o.invoiceId && <Link href={`/invoices/${o.invoiceId}`} className="btn-secondary">Voir la facture</Link>}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Travaux">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune ligne. Ajoutez les pièces posées et la main-d&apos;œuvre ci-dessous.</p>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="text-right">Qté</th>
                      <th className="text-right">Prix</th>
                      <th className="text-right">Total</th>
                      {editable && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Badge tone={i.kind === "part" ? "blue" : "amber"}>{i.kind === "part" ? "Pièce" : "Main-d'œuvre"}</Badge> {i.description}
                        </td>
                        <td className="text-right">{formatQty(i.quantity)}</td>
                        <td className="text-right">{m(i.unitPrice)}</td>
                        <td className="text-right">{m(i.quantity * i.unitPrice)}</td>
                        {editable && (
                          <td className="text-right">
                            <form action={removeRepairItemAction.bind(null, o.id, i.id)}>
                              <button className="text-xs text-red-600 hover:underline">Retirer</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={3} className="text-right text-slate-500">Pièces</td><td className="text-right">{m(totals.parts)}</td>{editable && <td />}</tr>
                    <tr><td colSpan={3} className="text-right text-slate-500">Main-d&apos;œuvre</td><td className="text-right">{m(totals.labor)}</td>{editable && <td />}</tr>
                    <tr><td colSpan={3} className="text-right font-semibold">Total {priceBasis(ctx.company.taxMode)}</td><td className="text-right font-semibold">{m(totals.total)}</td>{editable && <td />}</tr>
                  </tfoot>
                </table>
              </TableWrap>
            )}
          </Card>
          {editable && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Ajouter une pièce">
                <ActionForm action={addRepairItemAction.bind(null, o.id)} className="grid grid-cols-2 gap-3" resetOnSuccess>
                  <input type="hidden" name="kind" value="part" />
                  <SelectField
                    label="Pièce"
                    name="productId"
                    required
                    placeholder="— Choisir —"
                    options={parts.map((p) => {
                      const extra = attributeSummary(trade, p.attributes);
                      return { value: p.id, label: `${p.name}${extra ? ` (${extra})` : ""} · stock ${formatQty(p.stock)} · ${m(p.promoPrice ?? p.salePrice)}` };
                    })}
                    className="col-span-2"
                  />
                  <Field label="Quantité" name="quantity" inputMode="decimal" defaultValue={1} required />
                  <Field label="Prix (facultatif)" name="unitPrice" inputMode="decimal" placeholder="Prix de la fiche" />
                  <SubmitButton className="btn-secondary col-span-2" pendingText="…">Ajouter la pièce</SubmitButton>
                </ActionForm>
              </Card>
              <Card title="Ajouter de la main-d'œuvre">
                <ActionForm action={addRepairItemAction.bind(null, o.id)} className="grid grid-cols-2 gap-3" resetOnSuccess>
                  <input type="hidden" name="kind" value="labor" />
                  <Field label="Travail effectué" name="description" required placeholder="Ex. Vidange + remplacement plaquettes" className="col-span-2" />
                  <Field label="Heures" name="quantity" inputMode="decimal" defaultValue={1} required />
                  <Field label="Prix par heure" name="unitPrice" inputMode="decimal" required />
                  <SubmitButton className="btn-secondary col-span-2" pendingText="…">Ajouter</SubmitButton>
                </ActionForm>
              </Card>
            </div>
          )}
          <Card title="Diagnostic et suivi">
            {editable ? (
              <ActionForm action={updateRepairAction.bind(null, o.id)} className="grid gap-3 sm:grid-cols-3">
                <TextArea label="Diagnostic / travaux réalisés" name="diagnosis" defaultValue={o.diagnosis ?? ""} className="sm:col-span-3" />
                <Field label="Kilométrage" name="mileage" inputMode="numeric" defaultValue={o.mileage ?? ""} />
                <Field label="Promis pour le" name="promisedAt" type="date" defaultValue={o.promisedAt ?? ""} />
                <div className="flex items-end"><SubmitButton className="btn-secondary w-full">Enregistrer</SubmitButton></div>
              </ActionForm>
            ) : (
              <p className="whitespace-pre-line text-sm">{o.diagnosis || "—"}</p>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Véhicule">
            <p className="font-mono text-lg font-semibold">{v.plate}</p>
            <p className="text-sm">{[v.brand, v.model, v.year].filter(Boolean).join(" ") || "—"}</p>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              {v.vin && <div>VIN : <span className="font-mono">{v.vin}</span></div>}
              {(o.mileage ?? v.mileage) && <div>Kilométrage : {(o.mileage ?? v.mileage)!.toLocaleString("fr-FR")} km</div>}
            </dl>
            {o.complaint && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="text-xs font-medium text-slate-500">Demande du client</div>
                <p className="whitespace-pre-line">{o.complaint}</p>
              </div>
            )}
          </Card>
          <Card title="Client">
            <Link href={`/customers/${c.id}`} className="font-medium text-brand-700">{c.name}</Link>
            {c.phone && <p className="text-sm text-slate-600">{c.phone}</p>}
          </Card>
          {editable && (
            <Card title="Actions">
              <div className="space-y-2">
                {can(ctx.permissions, "invoices.create") && (
                  <ActionForm action={invoiceRepairAction.bind(null, o.id)}>
                    <SubmitButton className="btn-primary w-full" pendingText="Facturation…">Facturer ({m(totals.total)})</SubmitButton>
                    <p className="mt-1 text-xs text-slate-500">Crée la facture du client et sort les pièces du stock.</p>
                  </ActionForm>
                )}
                {o.status !== "done" && (
                  <form action={setRepairStatusAction.bind(null, o.id, "done")}>
                    <button className="btn-secondary w-full">Marquer terminé (véhicule prêt)</button>
                  </form>
                )}
                {o.status === "done" && (
                  <form action={setRepairStatusAction.bind(null, o.id, "in_progress")}>
                    <button className="btn-secondary w-full">Remettre en cours</button>
                  </form>
                )}
                <form action={setRepairStatusAction.bind(null, o.id, "cancelled")}>
                  <button className="btn-ghost w-full text-red-600">Annuler l&apos;ordre</button>
                </form>
              </div>
            </Card>
          )}
          {history.length > 0 && (
            <Card title="Passages précédents">
              <ul className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={`/repairs/${h.id}`} className="font-medium text-brand-700">{h.number}</Link>{" "}
                    <span className="text-slate-500">· {formatDate(h.createdAt)} · {REPAIR_STATUS[h.status].label}</span>
                    {h.complaint && <div className="truncate text-xs text-slate-500">{h.complaint}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
