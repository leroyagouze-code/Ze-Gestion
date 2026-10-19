import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Règles de confidentialité" };

export default function ConfidentialitePage() {
  return (
    <article className="card space-y-4 p-6 text-sm leading-relaxed text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Règles de confidentialité</h1>
      <p>
        ZE Gestion est un logiciel de gestion commerciale (caisse, stock, factures, rapports) édité par ZE Group. Cette page
        explique quelles données nous traitons et pourquoi.
      </p>
      <h2 className="font-semibold text-slate-900">Données collectées</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Votre compte : nom, adresse e-mail, mot de passe chiffré, rôle dans l&apos;entreprise.</li>
        <li>Les données de votre entreprise que vous saisissez : produits, stocks, ventes, clients, fournisseurs, factures.</li>
        <li>Le journal d&apos;activité : connexions, adresse IP et actions importantes, pour la sécurité de votre compte.</li>
      </ul>
      <h2 className="font-semibold text-slate-900">Connexion avec Google</h2>
      <p>
        Si vous choisissez « Continuer avec Google », nous recevons seulement votre nom, votre adresse e-mail et
        l&apos;identifiant de votre compte Google. Nous n&apos;avons accès ni à vos e-mails, ni à vos fichiers, ni à vos
        contacts Google.
      </p>
      <h2 className="font-semibold text-slate-900">Utilisation</h2>
      <p>
        Ces données servent uniquement à faire fonctionner le service, à vous envoyer les codes de vérification et les
        e-mails liés à votre compte, et au support. Elles ne sont ni vendues ni partagées à des fins publicitaires.
        Chaque entreprise ne voit que ses propres données.
      </p>
      <h2 className="font-semibold text-slate-900">Conservation et suppression</h2>
      <p>
        Les données sont conservées tant que votre compte est actif, puis supprimées sur demande. Vous pouvez demander
        l&apos;accès, la correction ou la suppression de vos données en écrivant à{" "}
        <span className="font-medium">contact@zegroupafrica.com</span>.
      </p>
      <p className="pt-2">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </article>
  );
}
