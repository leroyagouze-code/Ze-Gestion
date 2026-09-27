import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { ROLE_LABELS } from "@/lib/permissions";
import { listSpaces } from "@/modules/auth/context";
import { logoutAction, switchSpaceAction } from "../(public)/actions";

export const metadata: Metadata = { title: "Mes espaces" };

export default async function SpacesPage() {
  const s = await getSession();
  if (!s) redirect("/connexion");
  const spaces = await listSpaces(s.userId);
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <Logo className="text-lg text-brand-800" />
      <h1 className="mt-8 text-2xl font-bold">Choisir un espace</h1>
      <div className="mt-5 space-y-3">
        {spaces.orgs.map((o) => (
          <form key={o.id} action={switchSpaceAction}>
            <input type="hidden" name="space" value={o.id} />
            <button className="card flex w-full items-center gap-3 p-4 text-left hover:border-brand-200">
              <span className="text-2xl" aria-hidden>{o.kind === "AGENCY" ? "🏢" : "👤"}</span>
              <span>
                <span className="block font-bold">{o.name}</span>
                <span className="text-[14px] text-stone-600">{ROLE_LABELS[o.role]}</span>
              </span>
            </button>
          </form>
        ))}
        {spaces.isTenant && (
          <form action={switchSpaceAction}>
            <input type="hidden" name="space" value="tenant" />
            <button className="card flex w-full items-center gap-3 p-4 text-left hover:border-brand-200">
              <span className="text-2xl" aria-hidden>🏠</span>
              <span className="font-bold">Mon espace locataire</span>
            </button>
          </form>
        )}
        {!spaces.orgs.length && !spaces.isTenant && (
          <div className="card">
            <EmptyState icon="🔑" title="Aucun espace pour le moment">
              Demandez à votre agence ou propriétaire de vous envoyer un lien d&apos;invitation.
            </EmptyState>
          </div>
        )}
      </div>
      <form action={logoutAction} className="mt-8">
        <button className="btn-ghost w-full">Se déconnecter</button>
      </form>
    </div>
  );
}
