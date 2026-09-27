import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <EmptyState icon="🔒" title="Accès non autorisé">
          Votre rôle ne permet pas d&apos;ouvrir cette page. Demandez à l&apos;administrateur de votre agence si besoin.
          <div className="mt-4">
            <Link href="/tableau-de-bord" className="btn-secondary">
              Retour à l&apos;accueil
            </Link>
          </div>
        </EmptyState>
      </div>
    </div>
  );
}
