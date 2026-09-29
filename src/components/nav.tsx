"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Boxes,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  UserCog,
  Wallet,
  X,
  Shield,
  Tag,
} from "lucide-react";
import { Logo } from "./logo";

const ICONS = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  sales: Receipt,
  invoices: FileText,
  products: Package,
  stock: Boxes,
  customers: Users,
  suppliers: Truck,
  expenses: Wallet,
  reports: BarChart3,
  users: UserCog,
  settings: Settings,
  audit: History,
  admin: Shield,
  licence: KeyRound,
  promos: Tag,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function AppShell({
  items,
  companyName,
  userName,
  roleName,
  logoutAction,
  children,
}: {
  items: NavItem[];
  companyName: string;
  userName: string;
  roleName: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon size={18} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
  const footer = (
    <div className="border-t border-slate-200 p-3">
      <div className="truncate text-sm font-medium">{userName}</div>
      <div className="mb-2 text-xs text-slate-500">
        {roleName} · <Link href="/account/password" className="hover:underline">Mot de passe</Link>
      </div>
      <form action={logoutAction}>
        <button className="btn-secondary w-full">Déconnexion</button>
      </form>
    </div>
  );
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="border-b border-slate-200 px-4 py-4">
          <Logo size={28} className="mb-2 text-sm" />
          <div className="truncate font-semibold">{companyName}</div>
        </div>
        {nav}
        {footer}
      </aside>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button aria-label="Menu" onClick={() => setOpen(true)} className="btn-ghost px-2">
          <Menu size={20} />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <Logo size={24} showName={false} />
          <span className="truncate font-semibold">{companyName}</span>
        </span>
        <Link href="/pos" className="btn-primary px-3 py-1.5">
          <ShoppingCart size={16} /> Caisse
        </Link>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <Logo size={24} showName={false} />
                <span className="truncate font-semibold">{companyName}</span>
              </span>
              <button aria-label="Fermer" onClick={() => setOpen(false)} className="btn-ghost px-2">
                <X size={20} />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
