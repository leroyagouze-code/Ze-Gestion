import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function ConditionsPage() {
  return (
    <article className="card space-y-4 p-6 text-sm leading-relaxed text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Conditions d&apos;utilisation</h1>
      <p>
        En créant un compte sur ZE Gestion, service édité par ZE Group, vous acceptez les conditions suivantes.
      </p>
      <h2 className="font-semibold text-slate-900">Le service</h2>
      <p>
        ZE Gestion permet de gérer la caisse, le stock, les ventes, les factures, les clients et les fournisseurs
        d&apos;une entreprise. Une période d&apos;essai gratuite est offerte, puis l&apos;accès continue avec un abonnement
        ou une licence payante.
      </p>
      <h2 className="font-semibold text-slate-900">Votre compte</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Vous fournissez des informations exactes et gardez votre mot de passe secret.</li>
        <li>Vous êtes responsable des utilisateurs que vous ajoutez et de leurs actions.</li>
        <li>Vous restez propriétaire des données de votre entreprise.</li>
      </ul>
      <h2 className="font-semibold text-slate-900">Utilisation acceptable</h2>
      <p>
        Le service ne doit pas servir à des activités illégales ni à tenter d&apos;accéder aux données d&apos;autres
        entreprises. En cas d&apos;abus, le compte peut être suspendu.
      </p>
      <h2 className="font-semibold text-slate-900">Disponibilité</h2>
      <p>
        Nous faisons de notre mieux pour que le service reste disponible et que les données soient sauvegardées, sans
        pouvoir garantir l&apos;absence totale d&apos;interruption.
      </p>
      <h2 className="font-semibold text-slate-900">Contact</h2>
      <p>
        Pour toute question : <span className="font-medium">contact@zegroupafrica.com</span>. Nos règles de
        confidentialité sont décrites sur la page{" "}
        <Link href="/confidentialite" className="text-brand-700 hover:underline">
          Confidentialité
        </Link>
        .
      </p>
      <p className="pt-2">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </article>
  );
}
