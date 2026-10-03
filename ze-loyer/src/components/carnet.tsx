import clsx from "clsx";
import { formatMoney } from "@/lib/money";
import { capitalize, dayMonth, longDate, monthLabel, shortDate } from "@/modules/finance/dates";
import type { Situation } from "@/modules/finance/ledger";
import { LineBadge, Money } from "./ui";

/**
 * Le carnet locatif : la situation en un coup d'œil (moins de 10 secondes),
 * puis l'historique mois par mois. Utilisé côté locataire ET côté propriétaire/agence.
 */
export function SituationPanel({ s, rent, perspective = "tenant" }: { s: Situation; rent: number; perspective?: "tenant" | "staff" }) {
  const you = perspective === "tenant";
  const overdueLines = s.lines.filter((l) => l.kind !== "PROJECTED" && l.overdue);
  const cfg =
    s.status === "EN_RETARD"
      ? { emoji: "🔴", title: you ? "Vous avez un solde" : "Solde impayé", cls: "bg-red-700", amount: s.overdueAmount }
      : s.status === "EN_AVANCE"
        ? { emoji: "🔵", title: you ? "Vous êtes en avance" : "En avance", cls: "bg-sky-700", amount: s.advance }
        : { emoji: "🟢", title: you ? "Vous êtes à jour" : "À jour", cls: "bg-brand-700", amount: null };

  return (
    <section className="card overflow-hidden" aria-label="Situation actuelle">
      <div className={clsx("px-5 py-5 text-white", cfg.cls)}>
        <p className="text-[13px] font-semibold uppercase tracking-wide opacity-85">Situation actuelle</p>
        <p className="mt-1 text-[22px] font-extrabold uppercase leading-tight">
          <span aria-hidden>{cfg.emoji}</span> {cfg.title}
        </p>
        {cfg.amount !== null && <p className="mt-1 text-[32px] font-extrabold tabular-nums">{formatMoney(cfg.amount, "FCFA")}</p>}
        {s.status === "EN_RETARD" && s.daysLate > 0 && <p className="mt-1 text-[15px] opacity-90">En retard depuis {s.daysLate} jour{s.daysLate > 1 ? "s" : ""}</p>}
        {s.status === "EN_AVANCE" && s.coveredUntil && (
          <p className="mt-1 text-[16px]">
            {you ? "Votre loyer est couvert jusqu'au" : "Loyer couvert jusqu'au"} <strong>{longDate(s.coveredUntil)}</strong>
          </p>
        )}
      </div>

      {s.status === "EN_RETARD" && overdueLines.length > 0 && (
        <div className="border-b border-sand-100 px-5 py-3">
          <p className="text-[14px] font-semibold text-stone-600">Détail :</p>
          <ul className="mt-1 space-y-1">
            {overdueLines.map((l) => (
              <li key={l.key} className="flex justify-between text-[15px]">
                <span>{l.periodStart ? capitalize(monthLabel(l.periodStart)) : `Ajustement du ${shortDate(l.dueDate)}`}</span>
                <Money value={l.remaining} className="font-semibold text-red-800" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 divide-x divide-sand-100">
        <div className="px-5 py-4">
          <dt className="text-[14px] text-stone-600">Loyer</dt>
          <dd className="text-[20px] font-bold tabular-nums">{formatMoney(rent, "FCFA")}</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-[14px] text-stone-600">Prochaine échéance</dt>
          <dd className="text-[20px] font-bold">{s.nextDue ? dayMonth(s.nextDue.date) : "—"}</dd>
          {s.nextDue && s.nextDue.amount !== rent && <dd className="text-[13px] text-stone-600">reste {formatMoney(s.nextDue.amount)}</dd>}
        </div>
      </dl>
    </section>
  );
}

/** Historique mois par mois : prévu, payé, reste, date, statut. Plus récent en haut. */
export function HistoryList({ s, limit }: { s: Situation; limit?: number }) {
  const lines = s.lines.slice().reverse();
  const shown = limit ? lines.slice(0, limit) : lines;
  if (!shown.length) return <p className="p-4 text-[15px] text-stone-600">Aucune échéance pour le moment.</p>;
  return (
    <ul className="divide-y divide-sand-100">
      {shown.map((l) => (
        <li key={l.key} className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[16px] font-bold">
              {l.kind === "DEBIT" ? `Ajustement / remboursement` : capitalize(monthLabel(l.periodStart!))}
            </p>
            <LineBadge status={l.status} projected={l.kind === "PROJECTED"} />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 text-[14px] text-stone-600">
            <span>
              Prévu <Money value={l.amount} className="font-semibold text-ink" />
              {l.paid > 0 && l.remaining > 0 && (
                <>
                  {" "}· payé <Money value={l.paid} className="font-semibold text-ink" /> · reste <Money value={l.remaining} className="font-semibold text-red-800" />
                </>
              )}
            </span>
            <span>
              {l.remaining === 0 && l.paidOn
                ? l.kind === "PROJECTED"
                  ? `Réglé d'avance le ${shortDate(l.paidOn)}`
                  : `Payé le ${shortDate(l.paidOn)}`
                : `Échéance : ${shortDate(l.dueDate)}`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
