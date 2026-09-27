import { EmptyState } from "@/components/ui";
import { formatPhone } from "@/lib/phone";

export function NoLease({ phone }: { phone: string }) {
  return (
    <div className="card">
      <EmptyState icon="🔑" title="Votre logement n'est pas encore relié">
        Demandez à votre agence ou à votre propriétaire de vous envoyer votre lien ZE LOYER. Donnez-lui votre numéro : <strong>{formatPhone(phone)}</strong>.
      </EmptyState>
    </div>
  );
}
