import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, TextArea } from "@/components/ui";
import { CountryFields } from "@/components/country-fields";
import { COUNTRIES, COUNTRY_INFO, CURRENCIES } from "@/lib/locale";
import { TRADES } from "@/lib/trades";
import { signupAction } from "../actions";

export const metadata = { title: "Créer mon entreprise" };

export default function SignupPage() {
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Créer mon entreprise</h1>
      <p className="mb-4 text-sm text-slate-500">14 jours d&apos;essai, sans carte bancaire. Votre espace est prêt en quelques secondes.</p>
      <ActionForm action={signupAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2" showOk={false}>
        <fieldset className="sm:col-span-2">
          <legend className="label">Votre métier</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(TRADES).map(([key, t]) => (
              <label key={key} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="businessType" value={key} defaultChecked={key === "general"} className="mt-0.5 accent-brand-700" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Le logiciel s&apos;adapte à votre métier. Vous pourrez le changer dans les paramètres.</p>
        </fieldset>
        <Field label="Nom de l'entreprise" name="companyName" required className="sm:col-span-2" />
        <Field label="Nom du responsable" name="ownerName" required />
        <Field label="Téléphone" name="phone" type="tel" placeholder="+228 90 00 00 00" />
        <Field label="WhatsApp" name="whatsapp" type="tel" />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8 caractères minimum" className="sm:col-span-2" />
        <Field label="Adresse" name="address" />
        <Field label="Ville" name="city" />
        <CountryFields countries={COUNTRIES} currencies={CURRENCIES} countryInfo={COUNTRY_INFO} defaults={{ country: "TG", currency: "XOF", timezone: "Africa/Lome" }} />
        <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">Votre pays règle la devise, l&apos;heure et la TVA de départ. Tout reste modifiable dans les paramètres.</p>
        <Field label="N° d'identification fiscale" name="taxId" hint="Si applicable" />
        <Field label="Adresse de facturation" name="billingAddress" />
        <TextArea label="Informations complémentaires" name="extraInfo" className="sm:col-span-2" />
        <p className="text-xs text-slate-500 sm:col-span-2">Le logo et les couleurs se configurent juste après l&apos;inscription.</p>
        <SubmitButton className="btn-primary w-full sm:col-span-2" pendingText="Création de votre espace…">
          Créer mon espace
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm text-slate-600">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
