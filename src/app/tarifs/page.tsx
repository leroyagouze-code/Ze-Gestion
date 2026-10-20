import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/auth/server";
import { isDesktop } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { listSubscriptionOffers, subPrice } from "@/modules/billing/subscription-orders";

export const metadata = { title: "Tarifs", description: "Formules et prix de ZE Gestion : caisse, stock, factures et rapports pour votre commerce." };
export const dynamic = "force-dynamic";

const POPULAR = "PRO";

export default async function PricingPage() {
  if (isDesktop()) notFound();
  const [offers, session] = await Promise.all([listSubscriptionOffers(), getSession()]);
  const cta = session ? { href: "/abonnement", label: "Choisir cette formule" } : { href: "/signup", label: "Essayer 14 jours gratuits" };
  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link href="/"><Logo size={40} className="text-xl" /></Link>
          <nav className="flex gap-2 text-sm">
            {session ? (
              <Link href="/" className="btn-secondary">Mon espace</Link>
            ) : (
              <>
                <Link href="/login" className="btn-secondary">Se connecter</Link>
                <Link href="/signup" className="btn-primary">Créer mon entreprise</Link>
              </>
            )}
          </nav>
        </header>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">Des prix simples pour votre commerce</h1>
          <p className="mx-auto mt-2 max-w-2xl text-slate-600">
            14 jours d&apos;essai gratuit avec toutes les fonctions, sans carte bancaire. Ensuite, payez par TMoney ou Flooz. Sur 12 mois, vous ne payez que 10 mois.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {offers.map((p) => {
            const popular = p.code === POPULAR;
            return (
              <div key={p.code} className={`card relative flex flex-col p-6 ${popular ? "ring-2 ring-brand-600" : ""}`}>
                {popular && <span className="absolute -top-3 left-6 rounded-full bg-brand-700 px-3 py-0.5 text-xs font-semibold text-white">Le plus choisi</span>}
                <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                <div className="mt-3">
                  <span className="text-3xl font-bold tabular-nums text-slate-900">{formatMoney(p.monthlyPrice, p.currency)}</span>
                  <span className="text-sm text-slate-500"> / mois</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  ou {formatMoney(subPrice(p.monthlyPrice, 12), p.currency)} pour 12 mois
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-brand-700">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={cta.href} className={`mt-6 w-full ${popular ? "btn-primary" : "btn-secondary"}`}>{cta.label}</Link>
              </div>
            );
          })}
        </div>

        <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <div>
            <div className="font-semibold text-slate-900">Logiciel Windows, sans internet</div>
            <p className="text-slate-600">Mêmes formules, installées sur votre ordinateur, avec une licence liée au poste.</p>
          </div>
          <Link href="/acheter-licence" className="btn-secondary">Acheter une licence</Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Prix en francs CFA. Questions : contact@zegroupafrica.com ·{" "}
          <Link href="/conditions" className="hover:underline">Conditions d&apos;utilisation</Link> ·{" "}
          <Link href="/confidentialite" className="hover:underline">Confidentialité</Link>
        </p>
      </div>
    </div>
  );
}
