import { Field, SelectField } from "@/components/ui";
import { PROMO_KINDS } from "@/lib/promo";

type Defaults = {
  code?: string;
  description?: string | null;
  kind?: string;
  value?: number;
  startsOn?: string | null;
  endsOn?: string | null;
  maxUses?: number | null;
  isActive?: boolean;
};

/** Champs communs des formulaires de code promo (plateforme et entreprise). */
export function PromoFields({ d = {}, currencyLabel = "FCFA" }: { d?: Defaults; currencyLabel?: string }) {
  return (
    <>
      <Field label="Code" name="code" defaultValue={d.code} required placeholder="Ex. RENTREE10" autoComplete="off" hint="Lettres, chiffres, - ou _ ; reconnu en majuscules ou minuscules" />
      <Field label="Description (facultatif)" name="description" defaultValue={d.description ?? ""} placeholder="Ex. Offre de rentrée" />
      <SelectField label="Type de réduction" name="kind" defaultValue={d.kind ?? "percent"} options={Object.entries(PROMO_KINDS).map(([value, label]) => ({ value, label: value === "amount" ? `${label} (${currencyLabel})` : `${label} (%)` }))} />
      <Field label="Valeur" name="value" defaultValue={d.value ?? ""} required inputMode="decimal" hint="Ex. 10 pour 10 %, ou 2000 pour 2 000 FCFA" />
      <Field label="Valable à partir du (facultatif)" name="startsOn" type="date" defaultValue={d.startsOn ?? ""} />
      <Field label="Jusqu'au (inclus, facultatif)" name="endsOn" type="date" defaultValue={d.endsOn ?? ""} />
      <Field label="Nombre maximal d'utilisations (facultatif)" name="maxUses" type="number" min={1} step={1} defaultValue={d.maxUses ?? ""} hint="Vide : sans limite" />
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={d.isActive ?? true} className="accent-brand-700" /> Actif
      </label>
    </>
  );
}

/** Période de validité lisible : « du 01/10/2026 au 31/10/2026 », « jusqu'au … », « toujours ». */
export function promoPeriod(p: { startsOn: string | null; endsOn: string | null }, fmt: (d: string) => string) {
  if (p.startsOn && p.endsOn) return `du ${fmt(p.startsOn)} au ${fmt(p.endsOn)}`;
  if (p.startsOn) return `à partir du ${fmt(p.startsOn)}`;
  if (p.endsOn) return `jusqu'au ${fmt(p.endsOn)}`;
  return "sans limite de date";
}
