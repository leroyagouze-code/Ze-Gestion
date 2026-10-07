import Link from "next/link";
import clsx from "clsx";
import type { notifications } from "@/db/schema";
import { EmptyState } from "./ui";

export function NotificationsList({ items }: { items: (typeof notifications.$inferSelect)[] }) {
  if (!items.length) return <EmptyState icon="🔔" title="Aucune notification" />;
  return (
    <ul className="divide-y divide-sand-100">
      {items.map((n) => {
        const body = (
          <div className={clsx("px-4 py-3", !n.readAt && "bg-brand-50/60")}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">
                {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-600 align-middle" aria-label="Non lue" />}
                {n.title}
              </p>
              <span className="shrink-0 text-[12px] text-stone-500">{n.createdAt.toLocaleDateString("fr-FR", { timeZone: "Africa/Lome", day: "2-digit", month: "2-digit" })}</span>
            </div>
            <p className="mt-0.5 text-[15px] text-stone-700">{n.body}</p>
          </div>
        );
        return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-sand-50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}
