"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  FileText,
  History,
  Home,
  MessageSquareWarning,
  Receipt,
  Settings,
  UserCircle,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

const ICONS = {
  home: Home,
  building: Building2,
  users: Users,
  wallet: Wallet,
  chart: BarChart3,
  settings: Settings,
  book: BookOpen,
  receipt: Receipt,
  file: FileText,
  wrench: Wrench,
  profile: UserCircle,
  alert: AlertTriangle,
  dispute: MessageSquareWarning,
  owner: UserRound,
  history: History,
};

export type NavItem = { href: string; label: string; short?: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Barre de navigation en bas de l'écran (mobile) */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white/95 backdrop-blur lg:hidden" aria-label="Navigation principale" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx("relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-tight tracking-tight", active ? "text-brand-700" : "text-stone-500")}
              >
                <span className={clsx("flex h-8 w-12 items-center justify-center rounded-full transition", active && "bg-brand-100")}>
                  <Icon className="h-[22px] w-[22px]" aria-hidden strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
                {!!item.badge && <span className="absolute right-[18%] top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 text-white">{item.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Menu latéral (tablette paysage / ordinateur) */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition", active ? "bg-brand-700 text-white" : "text-stone-700 hover:bg-sand-100")}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && <span className={clsx("rounded-full px-2 text-[12px] leading-5", active ? "bg-white text-brand-800" : "bg-red-600 text-white")}>{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
