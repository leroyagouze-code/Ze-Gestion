import Link from "next/link";
import clsx from "clsx";
import { PERIOD_LABELS, type PeriodKey } from "@/modules/dashboard/service";

export function PeriodFilter({ current, from, to }: { current: PeriodKey; from?: string; to?: string }) {
  const keys = Object.keys(PERIOD_LABELS).filter((k) => k !== "custom") as PeriodKey[];
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {keys.map((k) => (
          <Link
            key={k}
            href={`?period=${k}`}
            className={clsx("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", current === k ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {PERIOD_LABELS[k]}
          </Link>
        ))}
      </div>
      <form className="flex items-center gap-2">
        <input type="hidden" name="period" value="custom" />
        <input type="date" name="from" defaultValue={from} className="input w-auto" aria-label="Du" />
        <input type="date" name="to" defaultValue={to} className="input w-auto" aria-label="Au" />
        <button className={clsx("btn-secondary", current === "custom" && "ring-2 ring-brand-500")}>OK</button>
      </form>
    </div>
  );
}

export function parsePeriod(sp: { period?: string }): PeriodKey {
  return (sp.period && sp.period in PERIOD_LABELS ? sp.period : "month") as PeriodKey;
}
