export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand-700">GestionPro</div>
          <p className="text-sm text-slate-500">Caisse, stock, factures et rapports pour votre commerce</p>
        </div>
        {children}
      </div>
    </div>
  );
}
