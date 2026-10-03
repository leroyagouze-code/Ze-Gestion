import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-4xl" aria-hidden>🔍</p>
      <h1 className="mt-3 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-stone-600">Cet élément n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
      <Link href="/" className="btn-primary mt-6">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
