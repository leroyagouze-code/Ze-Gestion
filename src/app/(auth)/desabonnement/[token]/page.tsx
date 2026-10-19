import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { setMarketingByToken, subscriptionByToken } from "@/modules/marketing/service";

export const metadata: Metadata = { title: "Désabonnement" };
export const dynamic = "force-dynamic";

// Formulaire plutôt que lien direct : les antivirus qui ouvrent les liens des e-mails ne désabonnent personne
async function setChoice(token: string, optIn: boolean) {
  "use server";
  await setMarketingByToken(token, optIn);
  revalidatePath(`/desabonnement/${token}`);
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await subscriptionByToken(token);
  return (
    <div className="card space-y-4 p-6 text-sm text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Offres et nouveautés par e-mail</h1>
      {!sub ? (
        <p>Ce lien n&apos;est plus valable.</p>
      ) : sub.optIn ? (
        <>
          <p>
            L&apos;adresse <strong>{sub.email}</strong> reçoit les offres et nouveautés de ZE Gestion. Les e-mails liés à votre
            compte (codes, sécurité) continueront d&apos;arriver.
          </p>
          <form action={setChoice.bind(null, token, false)}>
            <button className="btn-primary w-full">Ne plus recevoir les offres</button>
          </form>
        </>
      ) : (
        <>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            C&apos;est fait : <strong>{sub.email}</strong> ne recevra plus nos offres.
          </p>
          <form action={setChoice.bind(null, token, true)}>
            <button className="btn-secondary w-full">Je me suis trompé, me réabonner</button>
          </form>
        </>
      )}
      <p className="text-center">
        <Link href="/login" className="text-brand-700 hover:underline">Aller à ZE Gestion</Link>
      </p>
    </div>
  );
}
