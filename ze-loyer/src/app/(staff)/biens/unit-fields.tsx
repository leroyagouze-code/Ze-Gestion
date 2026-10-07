import { Field, SelectField, TextArea } from "@/components/ui";
import { PERIODICITY_LABELS, toOptions, UNIT_TYPE_LABELS } from "@/modules/finance/labels";

type Defaults = { label?: string; type?: string; rentAmount?: number; periodicity?: string; dueDay?: number; depositAmount?: number; description?: string | null };

export function UnitFields({ d }: { d?: Defaults }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Numéro" name="label" placeholder="A03" defaultValue={d?.label} required />
        <SelectField label="Type" name="type" options={toOptions(UNIT_TYPE_LABELS)} defaultValue={d?.type ?? "APPARTEMENT"} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Loyer (FCFA)" name="rentAmount" inputMode="numeric" placeholder="75 000" defaultValue={d?.rentAmount} required />
        <SelectField label="Périodicité" name="periodicity" options={toOptions(PERIODICITY_LABELS)} defaultValue={d?.periodicity ?? "MONTHLY"} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Jour d'échéance" name="dueDay" type="number" min={1} max={31} defaultValue={d?.dueDay ?? 5} hint="Ex. 5 = le 5 du mois" required />
        <Field label="Caution (FCFA)" name="depositAmount" inputMode="numeric" defaultValue={d?.depositAmount ?? 0} />
      </div>
      <TextArea label="Description (facultatif)" name="description" defaultValue={d?.description ?? ""} />
    </>
  );
}
