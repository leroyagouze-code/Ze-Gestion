import { Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";

/** Écart de caisse : vert si juste, ambre si excédent, rouge si manquant. */
export function DifferenceBadge({ value, currency }: { value: number; currency: string }) {
  if (value === 0) return <Badge tone="green">Juste</Badge>;
  return <Badge tone={value < 0 ? "red" : "amber"}>{value > 0 ? "+" : "−"}{formatMoney(Math.abs(value), currency)}</Badge>;
}
