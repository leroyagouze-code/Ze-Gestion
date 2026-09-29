import { requireContext } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { posSessionState } from "@/modules/registers/service";
import { OpenSessionForm, SessionPill } from "./session-gate";

/**
 * Enveloppe de l'écran de vente : si la boutique utilise des caisses, le caissier doit d'abord
 * ouvrir une session (caisse + fond de caisse). L'écran de vente lui-même n'est pas modifié.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext("sales.create");
  const state = await posSessionState(ctx);
  if (state.required && !state.session) {
    return <OpenSessionForm registers={state.registers} defaultRegisterId={state.defaultRegisterId} canManage={can(ctx.permissions, "registers.manage")} />;
  }
  return (
    <>
      {children}
      {state.session && <SessionPill id={state.session.id} registerName={state.session.registerName} openedAt={state.session.openedAt} />}
    </>
  );
}
