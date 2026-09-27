import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader, SelectField, TextArea } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { COUNTRIES, CURRENCIES } from "@/lib/locale";
import { updateCompanyAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Paramètres" };

export default async function CompanySettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireContext("settings.manage");
  const { welcome } = await searchParams;
  const c = ctx.company;
  return (
    <>
      <PageHeader title="Paramètres" />
      {welcome && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800">
          Bienvenue ! Votre espace est prêt. Ajoutez votre logo et vos informations : ils apparaîtront sur vos factures et tickets. Ensuite, créez vos produits.
        </div>
      )}
      <SettingsTabs current="company" />
      <ActionForm action={updateCompanyAction} className="space-y-4">
        <Card title="Identité">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-3">
              {c.logoUrl ? <img src={c.logoUrl} alt="Logo" className="h-16 w-16 rounded-lg object-contain ring-1 ring-slate-200" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">Logo</div>}
              <div>
                <label className="label" htmlFor="logo">Logo (PNG ou JPEG, 2 Mo max)</label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg" className="input" />
              </div>
            </div>
            <Field label="Nom de l'entreprise" name="name" defaultValue={c.name} required />
            <Field label="Responsable" name="ownerName" defaultValue={c.ownerName} required />
            <div>
              <label className="label" htmlFor="brandColor">Couleur principale</label>
              <input id="brandColor" name="brandColor" type="color" defaultValue={c.brandColor} className="h-10 w-full cursor-pointer rounded-lg border border-slate-300" />
            </div>
            <Field label="Email" name="email" type="email" defaultValue={c.email} required />
            <Field label="Téléphone" name="phone" type="tel" defaultValue={c.phone ?? ""} />
            <Field label="WhatsApp" name="whatsapp" type="tel" defaultValue={c.whatsapp ?? ""} />
            <Field label="Adresse" name="address" defaultValue={c.address ?? ""} />
            <Field label="Ville" name="city" defaultValue={c.city ?? ""} />
            <SelectField label="Pays" name="country" defaultValue={c.country} options={COUNTRIES} />
            <SelectField label="Devise" name="currency" defaultValue={c.currency} options={CURRENCIES} />
            <Field label="N° d'identification fiscale" name="taxId" defaultValue={c.taxId ?? ""} />
            <Field label="Adresse de facturation" name="billingAddress" defaultValue={c.billingAddress ?? ""} />
            <TextArea label="Informations complémentaires" name="extraInfo" defaultValue={c.extraInfo ?? ""} className="sm:col-span-2 lg:col-span-3" />
          </div>
        </Card>
        <Card title="Factures et tickets">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Format de facture" name="invoiceFormat" defaultValue={c.invoiceFormat} options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }]} />
            <SelectField label="Format du ticket de caisse" name="receiptFormat" defaultValue={c.receiptFormat} options={[{ value: "80mm", label: "Ticket 80 mm" }, { value: "58mm", label: "Ticket 58 mm" }, { value: "A4", label: "A4" }]} />
            <TextArea label="Informations bancaires" name="bankInfo" defaultValue={c.bankInfo ?? ""} />
            <TextArea label="Mentions par défaut sur les factures" name="invoiceNotes" defaultValue={c.invoiceNotes ?? ""} />
            <TextArea label="Pied de page des factures et tickets" name="invoiceFooter" defaultValue={c.invoiceFooter ?? ""} className="sm:col-span-2" />
          </div>
        </Card>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>
    </>
  );
}
