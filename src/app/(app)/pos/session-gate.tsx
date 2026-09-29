import Link from "next/link";
import { Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { openSessionAction } from "../caisses/actions";

type Register = { id: string; name: string; busyBy: string | null };

/**
 * Ouverture de caisse, affichée à la place de l'écran de vente tant que le caissier
 * n'a pas de session ouverte (seulement si la boutique utilise des caisses).
 */
export function OpenSessionForm({ registers, defaultRegisterId, canManage }: { registers: Register[]; defaultRegisterId: string | null; canManage: boolean }) {
  const free = registers.filter((r) => !r.busyBy);
  const preselected = free.find((r) => r.id === defaultRegisterId)?.id ?? free[0]?.id;
  return (
    <>
      <PageHeader title="Ouvrir la caisse" subtitle="Choisissez votre caisse et comptez le fond de caisse avant de commencer à vendre." />
      <div className="max-w-lg">
        <Card>
          {free.length === 0 ? (
            <EmptyState title="Aucune caisse libre">
              Toutes les caisses de la boutique sont ouvertes par d&apos;autres caissiers.{" "}
              {canManage ? <Link href="/caisses" className="text-brand-700 hover:underline">Gérer les caisses</Link> : "Prévenez votre responsable."}
            </EmptyState>
          ) : (
            <ActionForm action={openSessionAction} className="space-y-4" showOk={false}>
              <fieldset className="space-y-2">
                <legend className="label">Caisse</legend>
                {registers.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${r.busyBy ? "cursor-not-allowed border-slate-200 opacity-60" : "cursor-pointer border-slate-300 hover:bg-slate-50"}`}
                  >
                    <input type="radio" name="registerId" value={r.id} defaultChecked={r.id === preselected} disabled={!!r.busyBy} className="accent-brand-700" required />
                    <span className="flex-1 font-medium">{r.name}</span>
                    {r.busyBy && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Lock size={12} /> Ouverte par {r.busyBy}
                      </span>
                    )}
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="label" htmlFor="openingFloat">Fond de caisse (espèces au départ)</label>
                <input id="openingFloat" name="openingFloat" inputMode="decimal" defaultValue="0" className="input text-lg" required />
              </div>
              <SubmitButton className="btn-primary w-full py-3" pendingText="Ouverture…">Ouvrir la caisse</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}

/** Petit rappel de la session en cours, posé par-dessus l'écran de vente (sans le modifier). */
export function SessionPill({ id, registerName, openedAt }: { id: string; registerName: string; openedAt: Date }) {
  return (
    <Link
      href={`/caisses/sessions/${id}`}
      className="no-print fixed bottom-20 left-3 z-20 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs shadow-md hover:border-brand-500 lg:bottom-3 lg:left-[268px]"
      title="Voir la session et clôturer la caisse"
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span className="font-medium">{registerName}</span>
      <span className="text-slate-500">depuis {formatDate(openedAt, true)}</span>
      <span className="font-medium text-brand-700">Clôturer</span>
    </Link>
  );
}
