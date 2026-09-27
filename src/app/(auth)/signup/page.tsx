import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import { COUNTRIES, CURRENCIES } from "@/lib/locale";
import { signupAction } from "../actions";

export const metadata = { title: "Créer mon entreprise" };

export default function SignupPage() {
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Créer mon entreprise</h1>
      <p className="mb-4 text-sm text-slate-500">14 jours d&apos;essai, sans carte bancaire. Votre espace est prêt en quelques secondes.</p>
      <ActionForm action={signupAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2" showOk={false}>
        <Field label="Nom de l'entreprise" name="companyName" required className="sm:col-span-2" />
        <Field label="Nom du responsable" name="ownerName" required />
        <Field label="Téléphone" name="phone" type="tel" placeholder="+228 90 00 00 00" />
        <Field label="WhatsApp" name="whatsapp" type="tel" />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8 caractères minimum" className="sm:col-span-2" />
        <Field label="Adresse" name="address" />
        <Field label="Ville" name="city" />
        <SelectField label="Pays" name="country" defaultValue="TG" options={COUNTRIES} />
        <SelectField label="Devise" name="currency" defaultValue="XOF" options={CURRENCIES} />
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
