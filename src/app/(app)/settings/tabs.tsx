import Link from "next/link";
import clsx from "clsx";

export function SettingsTabs({ current }: { current: "company" | "billing" | "modules" }) {
  const tabs = [
    { key: "company", href: "/settings/company", label: "Entreprise et documents" },
    { key: "billing", href: "/settings/billing", label: "Taxes, paiements et numérotation" },
    { key: "modules", href: "/settings/modules", label: "Modules affichés" },
  ];
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", current === t.key ? "border-brand-700 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
