import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import type { products } from "@/db/schema";
import type { Trade } from "@/lib/trades";

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
  trade,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  options: Options;
  product?: typeof products.$inferSelect;
  categoryName?: string | null;
  brandName?: string | null;
  canCost: boolean;
  isNew?: boolean;
  trade: Trade;
}) {
  const p = product;
  const defaultTax = options.taxes.find((t) => t.isDefault)?.id;
  return (
    <ActionForm action={action} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nom" name="name" required defaultValue={p?.name} className="sm:col-span-2" />
        <Field label="Unité" name="unit" defaultValue={p?.unit ?? trade.defaultUnit} list="units" hint={trade.perishable ? "« kg » ou « litre » pour vendre au poids ou au volume (ex. 0,750)" : undefined} />
        <datalist id="units">
          {trade.units.map((u) => (
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
      {trade.attributes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="$attributes" value="1" />
          {trade.attributes.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              name={`attr_${f.key}`}
              placeholder={f.placeholder}
              required={f.required}
              inputMode={f.type === "number" ? "numeric" : undefined}
              defaultValue={p?.attributes?.[f.key] ?? ""}
            />
          ))}
        </div>
      )}
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
        {isNew && <Field label="Stock initial" name="initialStock" inputMode="decimal" hint="Boutique courante" defaultValue={trade.uniqueItems ? 1 : undefined} />}
        {!trade.uniqueItems && (
          <Field
            label={trade.perishable ? "Date de péremption" : "Date d'expiration"}
            name="expiryDate"
            type="date"
            defaultValue={p?.expiryDate ?? ""}
            hint={trade.perishable ? "Alerte sur le tableau de bord 30 jours avant" : undefined}
          />
        )}
        <div>
          <label className="label" htmlFor="image">Photo</label>
          <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
        </div>
      </div>
      <TextArea label="Description" name="description" defaultValue={p?.description ?? ""} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{isNew ? trade.item.create : "Enregistrer"}</SubmitButton>
        {isNew && (
          <button type="submit" name="$next" value="new" className="btn-secondary">
            Créer et ajouter un autre
          </button>
        )}
      </div>
    </ActionForm>
  );
}
