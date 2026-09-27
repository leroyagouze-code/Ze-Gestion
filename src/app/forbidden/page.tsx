import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Accès refusé</h1>
      <p className="text-slate-500">Votre rôle ne permet pas d&apos;ouvrir cette page. Contactez l&apos;administrateur de votre entreprise.</p>
      <Link href="/" className="btn-primary">
        Retour
      </Link>
    </div>
  );
}
