import Link from "next/link";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: React.ReactNode; back?: { href: string; label: string }; actions?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-brand-700 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-stone-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, action, children, className, padded = true }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-2 border-b border-sand-100 px-4 py-3">
          <h2 className="text-[17px] font-bold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

export function Money({ value, className, unit = "F" }: { value: number; className?: string; unit?: string }) {
  return <span className={clsx("tabular-nums whitespace-nowrap", className)}>{formatMoney(value, unit)}</span>;
}

type Tone = "green" | "red" | "orange" | "blue" | "gray";

const tones: Record<Tone, { badge: string; dot: string; panel: string; text: string }> = {
  green: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-600", panel: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  red: { badge: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-600", panel: "bg-red-50 border-red-200", text: "text-red-800" },
  orange: { badge: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500", panel: "bg-amber-50 border-amber-200", text: "text-amber-900" },
  blue: { badge: "bg-sky-50 text-sky-900 ring-sky-200", dot: "bg-sky-600", panel: "bg-sky-50 border-sky-200", text: "text-sky-900" },
  gray: { badge: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400", panel: "bg-stone-50 border-stone-200", text: "text-stone-700" },
};

export function toneClasses(tone: Tone) {
  return tones[tone];
}

/** Statut toujours accompagné d'un texte (jamais une couleur ou une icône seule) */
export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1 ring-inset", tones[tone].badge, className)}>
      <span className={clsx("h-2 w-2 rounded-full", tones[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

export function SituationBadge({ status }: { status: "A_JOUR" | "EN_RETARD" | "EN_AVANCE" }) {
  const tone: Tone = status === "A_JOUR" ? "green" : status === "EN_RETARD" ? "red" : "blue";
  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

export function LineBadge({ status, projected }: { status: "PAID" | "PARTIAL" | "DUE" | "LATE"; projected?: boolean }) {
  if (projected && status === "PAID") return <Badge tone="blue">{t("line.PROJECTED")}</Badge>;
  const tone: Tone = status === "PAID" ? "green" : status === "LATE" ? "red" : "orange";
  return <Badge tone={tone}>{t(`line.${status}`)}</Badge>;
}

export function UnitBadge({ status }: { status: "OCCUPIED" | "VACANT" | "RESERVED" }) {
  const tone: Tone = status === "OCCUPIED" ? "green" : status === "VACANT" ? "red" : "orange";
  return <Badge tone={tone}>{t(`unit.${status}`)}</Badge>;
}

/** Grand chiffre lisible (tableaux de bord) */
export function Stat({ label, value, tone, hint, href }: { label: string; value: React.ReactNode; tone?: Tone; hint?: React.ReactNode; href?: string }) {
  const body = (
    <div className={clsx("card h-full p-4", href && "transition hover:border-brand-200 hover:shadow-md")}>
      <div className="text-[14px] font-medium text-stone-600">{label}</div>
      <div className={clsx("mt-1 text-2xl font-bold tabular-nums sm:text-[28px]", tone ? tones[tone].text : "text-ink")}>{value}</div>
      {hint && <div className="mt-1 text-[13px] text-stone-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Ligne de liste cliquable, grande zone tactile */
export function ListLink({ href, title, subtitle, right, className }: { href: string; title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx("flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-sand-50", className)}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[14px] text-stone-600">{subtitle}</div>}
      </div>
      {right && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{right}</div>}
      <ChevronRight className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
    </Link>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-sand-100">{children}</div>;
}

export function Field({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={props.id ?? name}>
        {label}
        {props.required && <span className="text-red-700"> *</span>}
      </label>
      <input id={props.id ?? name} name={name} className="input" {...props} />
      {hint && <p className="mt-1 text-[13px] text-stone-500">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, className, hint, ...props }: { label: string; name: string; className?: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {props.required && <span className="text-red-700"> *</span>}
      </label>
      <textarea id={name} name={name} rows={3} className="input" {...props} />
      {hint && <p className="mt-1 text-[13px] text-stone-500">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  className,
  placeholder,
  hint,
  ...props
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
  hint?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={props.id ?? name}>
        {label}
        {props.required && <span className="text-red-700"> *</span>}
      </label>
      <select id={props.id ?? name} name={name} className="input" {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[13px] text-stone-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-4xl" aria-hidden>{icon}</div>}
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-[15px] text-stone-600">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "blue", title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-[15px]", tones[tone].panel, tones[tone].text)} role="status">
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

/** Ligne libellé / valeur */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-[15px] text-stone-600">{label}</dt>
      <dd className="text-right text-[15px] font-semibold text-ink">{children}</dd>
    </div>
  );
}

/** Filtres simples par liens (pas de menus complexes) */
export function FilterChips({ items, current }: { items: { href: string; label: string; value: string | undefined }[]; current: string | undefined }) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          className={clsx(
            "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[14px] font-semibold transition",
            i.value === current ? "border-brand-700 bg-brand-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
