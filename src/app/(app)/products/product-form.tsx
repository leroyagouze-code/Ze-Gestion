import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import type { products } from "@/db/schema";

type Options = {
  taxes: { id: string; name: string; isDefault: boolean }[];
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
};

export function ProductForm({
  action,
  options,
  product,
  categoryName,
  brandName,
  canCost,
  isNew,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  options: Options;
  product?: typeof products.$inferSelect;
  categoryName?: string | null;
  brandName?: string | null;
  canCost: boolean;
  isNew?: boolean;
}) {
  const p = product;
  const defaultTax = options.taxes.find((t) => t.isDefault)?.id;
  return (
    <ActionForm action={action} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nom" name="name" required defaultValue={p?.name} className="sm:col-span-2" />
        <Field label="Unité" name="unit" defaultValue={p?.unit ?? "pièce"} list="units" />
        <datalist id="units">
          {["pièce", "kg", "g", "litre", "carton", "sac", "paquet", "boîte", "mètre"].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <Field label="Référence" name="reference" defaultValue={p?.reference ?? ""} />
        <Field label="SKU" name="sku" defaultValue={p?.sku ?? ""} />
        <Field label="Code-barres" name="barcode" defaultValue={p?.barcode ?? ""} inputMode="numeric" />
        <Field label="Catégorie" name="categoryName" defaultValue={categoryName ?? ""} list="cats" />
        <datalist id="cats">{options.categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <Field label="Marque" name="brandName" defaultValue={brandName ?? ""} list="brands" />
        <datalist id="brands">{options.brands.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <SelectField
          label="Fournisseur"
          name="supplierId"
          defaultValue={p?.supplierId ?? ""}
          placeholder="—"
          options={options.suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {canCost && <Field label="Prix d'achat" name="purchasePrice" inputMode="decimal" defaultValue={p?.purchasePrice ?? ""} />}
        <Field label="Prix de vente (TTC)" name="salePrice" inputMode="decimal" required defaultValue={p?.salePrice ?? ""} />
        <Field label="Prix promotionnel" name="promoPrice" inputMode="decimal" defaultValue={p?.promoPrice ?? ""} />
        <SelectField
          label="Taxe"
          name="taxId"
          defaultValue={p ? (p.taxId ?? "") : defaultTax}
          placeholder="Aucune"
          options={options.taxes.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Field label="Stock minimum" name="minStock" inputMode="decimal" defaultValue={p?.minStock ?? 0} />
        {isNew && <Field label="Stock initial" name="initialStock" inputMode="decimal" hint="Boutique courante" />}
        <Field label="Date d'expiration" name="expiryDate" type="date" defaultValue={p?.expiryDate ?? ""} />
        <div>
          <label className="label" htmlFor="image">Photo</label>
          <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
        </div>
      </div>
      <TextArea label="Description" name="description" defaultValue={p?.description ?? ""} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{isNew ? "Créer le produit" : "Enregistrer"}</SubmitButton>
        {isNew && (
          <button type="submit" name="$next" value="new" className="btn-secondary">
            Créer et ajouter un autre
          </button>
        )}
      </div>
    </ActionForm>
  );
}
