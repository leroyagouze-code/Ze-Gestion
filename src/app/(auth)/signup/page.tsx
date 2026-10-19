import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, TextArea } from "@/components/ui";
import { CountryFields } from "@/components/country-fields";
import { COUNTRIES, COUNTRY_INFO, CURRENCIES } from "@/lib/locale";
import { cookies } from "next/headers";
import { GoogleButton } from "@/components/google-button";
import { GOOGLE_PENDING_COOKIE, googleEnabled, readPendingProfile } from "@/lib/auth/google";
import { signupAction } from "../actions";

export const metadata = { title: "Créer mon entreprise" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Retour de Google pour une adresse sans compte : email et nom repris, pas de mot de passe à choisir
  const google = googleEnabled() ? readPendingProfile((await cookies()).get(GOOGLE_PENDING_COOKIE)?.value) : null;
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Créer mon entreprise</h1>
      <p className="mb-4 text-sm text-slate-500">14 jours d&apos;essai, sans carte bancaire. Votre espace est prêt en quelques secondes.</p>
      {google ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Compte Google : <strong>{google.email}</strong>. Il ne reste qu&apos;à présenter votre entreprise.
        </p>
      ) : (
        googleEnabled() && <GoogleButton label="S'inscrire avec Google" />
      )}
      <ActionForm action={signupAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2" showOk={false}>
        <Field label="Nom de l'entreprise" name="companyName" required className="sm:col-span-2" />
        <Field label="Nom du responsable" name="ownerName" required defaultValue={google?.name} />
        <Field label="Téléphone" name="phone" type="tel" placeholder="+228 90 00 00 00" />
        <Field label="WhatsApp" name="whatsapp" type="tel" />
        {google ? (
          <>
            <input type="hidden" name="google" value="1" />
            <Field label="Email" name="email" type="email" value={google.email} readOnly />
          </>
        ) : (
          <>
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8 caractères minimum" className="sm:col-span-2" />
          </>
        )}
        <Field label="Adresse" name="address" />
        <Field label="Ville" name="city" />
        <CountryFields countries={COUNTRIES} currencies={CURRENCIES} countryInfo={COUNTRY_INFO} defaults={{ country: "TG", currency: "XOF", timezone: "Africa/Lome" }} />
        <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">Votre pays règle la devise, l&apos;heure et la TVA de départ. Tout reste modifiable dans les paramètres.</p>
        <Field label="N° d'identification fiscale" name="taxId" hint="Si applicable" />
        <Field label="Adresse de facturation" name="billingAddress" />
        <TextArea label="Informations complémentaires" name="extraInfo" className="sm:col-span-2" />
        <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="marketingOptIn" defaultChecked className="mt-0.5 accent-brand-700" />
          <span>Recevoir par e-mail les nouveautés et offres de ZE Gestion (désabonnement possible à tout moment).</span>
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          En créant votre espace, vous acceptez les{" "}
          <Link href="/conditions" className="underline">conditions d&apos;utilisation</Link> et les{" "}
          <Link href="/confidentialite" className="underline">règles de confidentialité</Link>.
        </p>
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
