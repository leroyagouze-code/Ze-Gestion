import Link from "next/link";
import clsx from "clsx";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "warn" | "bad" | "good" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={clsx(
          "mt-1 text-lg font-semibold sm:text-xl",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-red-600",
          tone === "good" && "text-emerald-700",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-800",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>{children}</span>;
}

export function Field({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {props.required && <span className="text-red-500"> *</span>}
      </label>
      <input id={name} name={name} className="input" {...props} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, className, ...props }: { label: string; name: string; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <textarea id={name} name={name} rows={3} className="input" {...props} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  className,
  placeholder,
  ...props
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} className="input" {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Pagination({ page, total, pageSize, params }: { page: number; total: number; pageSize: number; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-slate-500">{total} élément(s)</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-slate-500">
        {total} élément(s) · page {page}/{pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary" href={href(page - 1)}>
            Précédent
          </Link>
        )}
        {page < pages && (
          <Link className="btn-secondary" href={href(page + 1)}>
            Suivant
          </Link>
        )}
      </div>
    </div>
  );
}

export function SearchBar({ q, placeholder = "Rechercher…", children }: { q?: string; placeholder?: string; children?: React.ReactNode }) {
  return (
    <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
      <input name="q" defaultValue={q} placeholder={placeholder} className="input sm:max-w-sm" />
      {children}
      <button className="btn-secondary">Rechercher</button>
    </form>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 overflow-x-auto sm:mx-0">{children}</div>;
}
