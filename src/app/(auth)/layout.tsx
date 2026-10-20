import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Logo size={48} className="mb-2 text-2xl" />
          <p className="text-sm text-slate-500">Caisse, stock, factures et rapports pour votre commerce</p>
        </div>
        {children}
        <p className="mt-6 flex justify-center gap-4 text-xs text-slate-500">
          <Link href="/tarifs" className="hover:underline">
            Tarifs
          </Link>
          <Link href="/confidentialite" className="hover:underline">
            Confidentialité
          </Link>
          <Link href="/conditions" className="hover:underline">
            Conditions d&apos;utilisation
          </Link>
        </p>
      </div>
    </div>
  );
}
