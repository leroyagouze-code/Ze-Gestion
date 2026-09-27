import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer mon compte" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold">Créer mon compte</h1>
      <p className="mt-1 text-stone-600">Gratuit pour commencer. Moins d&apos;une minute.</p>
      <SignupForm defaultType={type === "AGENCY" || type === "TENANT" ? type : "OWNER"} />
      <p className="mt-6 text-center text-[15px] text-stone-600">
        Déjà un compte ?{" "}
        <Link href="/connexion" className="font-semibold text-brand-700 underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
