export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-4xl" aria-hidden>📶</p>
      <h1 className="mt-3 text-2xl font-bold">Pas de connexion internet</h1>
      <p className="mt-2 text-stone-600">Vérifiez votre connexion puis réessayez. Vos données sont en sécurité.</p>
      <a href="/" className="btn-primary mt-6">
        Réessayer
      </a>
    </div>
  );
}
