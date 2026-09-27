import { APP_NAME } from "@/lib/brand";

/** Logo ZE GROUP (tuile) suivi du nom du logiciel. */
export function Logo({ size = 32, showName = true, className = "" }: { size?: number; showName?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- petite image statique */}
      <img src="/brand/ze-tile.png" alt="ZE GROUP" width={size} height={size} className="shrink-0" />
      {showName && <span className="font-bold tracking-tight text-slate-900">{APP_NAME}</span>}
    </span>
  );
}
