import { Field, SelectField } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { METHOD_LABELS, toOptions } from "@/modules/finance/labels";

export type FreeUnit = { id: string; label: string; propertyName: string; rentAmount: number; depositAmount: number; status: string };

/** Champs « installer dans un logement » (logement, date d'entrée, caution versée). */
export function LeaseFields({ units, selected, today, optional }: { units: FreeUnit[]; selected?: string; today: string; optional?: boolean }) {
  return (
    <>
      <SelectField
        label="Logement"
        name="unitId"
        options={units.map((u) => ({ value: u.id, label: `${u.label} — ${u.propertyName} (${formatMoney(u.rentAmount)})${u.status === "RESERVED" ? " · réservé" : ""}` }))}
        defaultValue={selected}
        placeholder={optional ? "Pas encore de logement" : "Choisir un logement libre…"}
        required={!optional}
        hint={units.length ? undefined : "Aucun logement libre : ajoutez d'abord un logement dans un bien."}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date d'entrée" name="startDate" type="date" defaultValue={today} />
        <Field label="Jour d'échéance" name="dueDay" type="number" min={1} max={31} placeholder="Celui du logement" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Caution versée (FCFA)" name="depositPaid" inputMode="numeric" placeholder="0" hint="Laissez vide si rien n'est versé" />
        <SelectField label="Mode de paiement" name="depositMethod" options={toOptions(METHOD_LABELS)} defaultValue="CASH" />
      </div>
    </>
  );
}
