import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, SelectField } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatQty } from "@/lib/money";
import { formatNumber } from "@/modules/settings/sequences";
import { getSettings } from "@/modules/settings/service";
import { addPaymentMethodAction, saveTaxAction, togglePaymentMethodAction, updateSequenceAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Paramètres" };

const DOC_LABELS: Record<string, string> = { invoice: "Factures", sale: "Tickets de vente", quote: "Devis", delivery: "Bons de livraison", purchase_order: "Bons de commande" };
const TYPE_LABELS: Record<string, string> = { cash: "Espèces", mobile_money: "Mobile money", card: "Carte", transfer: "Virement", credit: "Crédit", other: "Autre" };

export default async function BillingSettingsPage() {
  const ctx = await requireContext("settings.manage");
  const s = await getSettings(ctx);
  const year = new Date().getFullYear();
  return (
    <>
      <PageHeader title="Paramètres" />
      <SettingsTabs current="billing" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Taxes">
          <div className="space-y-3">
            {s.taxes.map((t) => (
              <ActionForm key={t.id} action={saveTaxAction.bind(null, t.id)} className="grid grid-cols-12 items-end gap-2" showOk={false}>
                <Field label="Nom" name="name" defaultValue={t.name} className="col-span-5" />
                <Field label="Taux %" name="rate" defaultValue={formatQty(t.rate)} inputMode="decimal" className="col-span-3" />
                <label className="col-span-2 flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="isDefault" defaultChecked={t.isDefault} className="accent-brand-700" /> Défaut</label>
                <SubmitButton className="btn-secondary col-span-2 px-2" pendingText="…">OK</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveTaxAction.bind(null, null)} className="grid grid-cols-12 items-end gap-2 border-t border-slate-100 pt-3" resetOnSuccess>
              <Field label="Nouvelle taxe" name="name" placeholder="Ex. TVA 10 %" className="col-span-5" />
              <Field label="Taux %" name="rate" inputMode="decimal" className="col-span-3" />
              <label className="col-span-2 flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="isDefault" className="accent-brand-700" /> Défaut</label>
              <SubmitButton className="btn-primary col-span-2 px-2" pendingText="…">Ajouter</SubmitButton>
            </ActionForm>
          </div>
        </Card>
        <Card title="Moyens de paiement">
          <ul className="divide-y divide-slate-100">
            {s.paymentMethods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>{p.label} <span className="text-xs text-slate-400">· {TYPE_LABELS[p.type]}</span></span>
                <form action={togglePaymentMethodAction.bind(null, p.id, !p.isEnabled)}>
                  <button>{p.isEnabled ? <Badge tone="green">Activé</Badge> : <Badge>Désactivé</Badge>}</button>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={addPaymentMethodAction} className="mt-3 grid grid-cols-12 items-end gap-2 border-t border-slate-100 pt-3" resetOnSuccess>
            <Field label="Nouveau moyen" name="label" placeholder="Ex. Wave, Moov Money" className="col-span-6" />
            <SelectField label="Type" name="type" options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} defaultValue="mobile_money" className="col-span-4" />
            <SubmitButton className="btn-primary col-span-2 px-2" pendingText="…">Ajouter</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Numérotation des documents" className="xl:col-span-2">
          <p className="mb-3 text-xs text-slate-500">Motif : {"{PREFIX}"}, {"{YYYY}"} ou {"{YY}"}, {"{SEQ}"}. Exemple : {"{PREFIX}-{YYYY}-{SEQ}"}.</p>
          <div className="space-y-3">
            {s.sequences.map((q) => (
              <ActionForm key={q.docType} action={updateSequenceAction} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12" showOk={false}>
                <input type="hidden" name="docType" value={q.docType} />
                <div className="col-span-2 text-sm font-medium sm:col-span-2 sm:pb-2">{DOC_LABELS[q.docType] ?? q.docType}</div>
                <Field label="Préfixe" name="prefix" defaultValue={q.prefix} className="sm:col-span-2" />
                <Field label="Motif" name="pattern" defaultValue={q.pattern} className="sm:col-span-3" />
                <Field label="Chiffres" name="padding" defaultValue={q.padding} inputMode="numeric" className="sm:col-span-1" />
                <label className="flex items-center gap-1 pb-2 text-xs sm:col-span-2"><input type="checkbox" name="resetYearly" defaultChecked={q.resetYearly} className="accent-brand-700" /> Remise à zéro annuelle</label>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <SubmitButton className="btn-secondary px-3" pendingText="…">OK</SubmitButton>
                  <span className="truncate text-xs text-slate-500">Prochain : {formatNumber(q.pattern, q.prefix, year, q.currentYear !== year && q.resetYearly ? 1 : q.nextNumber, q.padding)}</span>
                </div>
              </ActionForm>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
