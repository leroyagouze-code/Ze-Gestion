"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-4xl" aria-hidden>⚠️</p>
      <h1 className="mt-3 text-2xl font-bold">Un problème est survenu</h1>
      <p className="mt-2 text-stone-600">Vérifiez votre connexion puis réessayez.</p>
      <button onClick={reset} className="btn-primary mt-6">
        Réessayer
      </button>
    </div>
  );
}
