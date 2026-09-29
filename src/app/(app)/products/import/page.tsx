import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { CSV_COLUMNS } from "@/modules/products/service";
import { importProductsAction } from "../actions";

export const metadata = { title: "Importer des produits" };

export default async function ImportPage() {
  await requireContext("products.edit");
  return (
    <>
      <PageHeader title="Importer des produits" subtitle="Fichier CSV (séparateur ; ou ,). Depuis Excel : Fichier › Enregistrer sous › CSV UTF-8." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Fichier">
          <ActionForm action={importProductsAction} className="space-y-4">
            <input type="file" name="file" accept=".csv,text/csv" className="input" required />
            <SubmitButton pendingText="Import en cours…">Importer</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Colonnes attendues">
          <p className="mb-2 text-sm text-slate-600">
            Seules <b>nom</b> et <b>prix_vente</b> sont obligatoires. Un produit déjà présent (même <b>code_barres</b>, <b>sku</b>, <b>reference</b> ou, à défaut, même <b>nom</b>) est mis à jour au lieu d&apos;être recréé ; son stock n&apos;est pas modifié (<b>stock_initial</b> ne sert qu&apos;aux nouveaux produits).
          </p>
          <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{CSV_COLUMNS.join(";")}</code>
          <a href="/api/export/products-template" className="btn-secondary mt-3">Télécharger le modèle</a>
        </Card>
      </div>
    </>
  );
}
