export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-sand-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-sand-100" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-2xl bg-sand-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-sand-100" />
      </div>
      <p className="text-center text-[15px] text-stone-500">Chargement…</p>
    </div>
  );
}
