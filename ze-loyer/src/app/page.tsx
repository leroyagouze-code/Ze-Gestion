import Link from "next/link";
import { Logo } from "@/components/shell";
import { getSession, homePath } from "@/lib/auth/server";

export default async function Landing() {
  const session = await getSession();
  const home = session ? await homePath() : null;
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Logo className="text-lg text-brand-800" />
        {home ? (
          <Link href={home} className="btn-primary btn-sm">
            Mon espace
          </Link>
        ) : (
          <Link href="/connexion" className="btn-ghost btn-sm">
            Se connecter
          </Link>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 pb-12 pt-6 md:grid-cols-2 md:pt-14">
          <div>
            <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-[13px] font-semibold text-brand-800">🇹🇬 Fait pour le Togo</p>
            <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              La gestion locative, <span className="text-brand-700">simplement.</span>
            </h1>
            <p className="mt-4 text-lg text-stone-700">Gérez vos logements, vos loyers et vos locataires depuis votre téléphone.</p>
            <p className="mt-2 text-[15px] text-stone-600">Votre location. Votre historique. Votre carnet. Toujours avec vous.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/inscription" className="btn-primary text-lg">
                Créer mon compte
              </Link>
              <Link href="/connexion" className="btn-secondary text-lg">
                Se connecter
              </Link>
            </div>
            <p className="mt-4 text-[14px] text-stone-500">FCFA · Espèces · TMoney · Flooz · Avances · Paiements partiels · Cautions</p>
          </div>

          {/* Aperçu du carnet locatif */}
          <div className="card mx-auto w-full max-w-sm overflow-hidden" aria-label="Exemple de carnet locatif">
            <div className="bg-brand-700 px-5 py-4 text-white">
              <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Mon carnet</p>
              <p className="mt-1 text-xl font-bold">🟢 Vous êtes à jour</p>
            </div>
            <div className="space-y-1 px-5 py-4">
              <div className="flex justify-between text-[15px]">
                <span className="text-stone-600">Loyer mensuel</span>
                <span className="font-bold">75 000 FCFA</span>
              </div>
              <div className="flex justify-between text-[15px]">
                <span className="text-stone-600">Prochaine échéance</span>
                <span className="font-bold">05 octobre</span>
              </div>
            </div>
            <ul className="divide-y divide-sand-100 border-t border-sand-100 text-[15px]">
              {[
                ["Octobre 2026", "🟠 À payer", "text-amber-800"],
                ["Septembre 2026", "🟢 Payé", "text-emerald-800"],
                ["Août 2026", "🟢 Payé", "text-emerald-800"],
              ].map(([m, s, c]) => (
                <li key={m} className="flex items-center justify-between px-5 py-3">
                  <span className="font-semibold">{m}</span>
                  <span className={`font-semibold ${c}`}>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-white py-12">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 md:grid-cols-3">
            {[
              { emoji: "👤", title: "Pour les propriétaires", text: "Gérez vos loyers simplement. Voyez en un coup d'œil qui a payé et qui vous doit de l'argent.", href: "/inscription?type=OWNER" },
              { emoji: "🏢", title: "Pour les agences", text: "Centralisez tous vos biens et propriétaires. Suivez les impayés, les cautions et les quittances.", href: "/inscription?type=AGENCY" },
              { emoji: "🧑🏾", title: "Pour les locataires", text: "Suivez votre situation et votre historique. Téléchargez vos quittances à tout moment.", href: "/inscription?type=TENANT" },
            ].map((b) => (
              <Link key={b.title} href={b.href} className="card block p-5 transition hover:border-brand-200 hover:shadow-md">
                <div className="text-3xl" aria-hidden>{b.emoji}</div>
                <h2 className="mt-2 text-lg font-bold">{b.title}</h2>
                <p className="mt-1 text-[15px] text-stone-600">{b.text}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-2xl font-bold">Le carnet locatif, partagé</h2>
          <p className="mt-2 max-w-2xl text-[16px] text-stone-700">
            Fini les cahiers, les reçus perdus et les captures Mobile Money. Le propriétaire ou l&apos;agence enregistre les paiements ; le locataire voit sa situation en temps réel dans son propre espace. Une seule source d&apos;information, claire pour tout le monde.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "🟢 Qui a payé, combien, pour quel mois",
              "🔴 Qui est en retard, et depuis combien de jours",
              "🔵 Paiements d'avance répartis automatiquement",
              "🧾 Quittances PDF générées à chaque paiement",
              "🔒 Chacun ne voit que ce qui le concerne",
              "📱 Fonctionne sur tous les téléphones, sans installation",
            ].map((x) => (
              <li key={x} className="card px-4 py-3 text-[15px] font-medium">
                {x}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-sand-200 py-6 text-center text-[13px] text-stone-500">ZE LOYER — La gestion locative, simplement.</footer>
    </div>
  );
}
