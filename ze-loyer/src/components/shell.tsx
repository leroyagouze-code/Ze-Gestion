import Link from "next/link";
import { Bell } from "lucide-react";
import { BottomNav, SideNav, type NavItem } from "./nav";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-[13px] text-white" aria-hidden>
        ZL
      </span>
      <span>ZE LOYER</span>
    </span>
  );
}

/** Coque commune : en-tête, menu latéral (grand écran), barre du bas (mobile). */
export function AppShell({
  homeHref,
  spaceLabel,
  userName,
  unread,
  notificationsHref,
  profileHref,
  bottomItems,
  sideItems,
  children,
}: {
  homeHref: string;
  spaceLabel: string;
  userName: string;
  unread: number;
  notificationsHref: string;
  profileHref: string;
  bottomItems: NavItem[];
  sideItems: NavItem[];
  children: React.ReactNode;
}) {
  const initials = userName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-sand-200 bg-white/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <Logo className="text-[17px] text-brand-800" />
          </Link>
          <span className="hidden min-w-0 truncate rounded-full bg-sand-100 px-3 py-1 text-[13px] font-medium text-stone-700 sm:inline">{spaceLabel}</span>
          <div className="ml-auto flex items-center gap-1">
            <Link href={notificationsHref} className="relative flex h-12 w-12 items-center justify-center rounded-full text-stone-700 hover:bg-sand-100" aria-label={`Notifications${unread ? ` : ${unread} non lue(s)` : ""}`}>
              <Bell className="h-6 w-6" aria-hidden />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <Link href={profileHref} className="flex h-12 w-12 items-center justify-center" aria-label="Mon compte">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-[14px] font-bold text-brand-800">{initials || "?"}</span>
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 lg:py-6">
        <aside className="no-print sticky top-22 hidden h-fit w-60 shrink-0 lg:block">
          <p className="mb-3 truncate px-3 text-[13px] font-semibold uppercase tracking-wide text-stone-500">{spaceLabel}</p>
          <SideNav items={sideItems} />
        </aside>
        <main className="min-w-0 flex-1 pb-28 pt-5 lg:pb-10 lg:pt-0">{children}</main>
      </div>
      <BottomNav items={bottomItems} />
    </div>
  );
}
