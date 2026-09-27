import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { isDesktop } from "@/lib/license";
import { LICENSE_DURATIONS } from "@/modules/billing/license";
import { listPrices } from "@/modules/billing/license-orders";
import { paymentMode } from "@/modules/billing/paygate";
import { createOrderAction } from "./actions";
import { OrderForm } from "./order-form";

export const metadata = { title: "Acheter une licence" };
export const dynamic = "force-dynamic";

const PLANS = [
  { code: "BASIC", name: "Basic", features: "3 utilisateurs, 2 000 produits, 1 boutique" },
  { code: "PRO", name: "Pro", features: "10 utilisateurs, produits illimités, 2 boutiques" },
  { code: "BUSINESS", name: "Business", features: "Utilisateurs, produits et boutiques illimités" },
];
const MONTHS: Record<string, number> = { "1": 1, "3": 3, "6": 6, "12": 12 };

export default async function BuyLicencePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  if (isDesktop()) notFound();
  const { code } = await searchParams;
  const mode = paymentMode();
  const prices = await listPrices({ activeOnly: true });
  const offers = prices.map((p) => ({
    value: `${p.plan}:${p.duration}`,
    plan: p.plan,
    duration: LICENSE_DURATIONS[p.duration as keyof typeof LICENSE_DURATIONS] ?? p.duration,
    amount: formatMoney(p.amount, p.currency),
    perMonth: MONTHS[p.duration] > 1 ? formatMoney(Math.round(p.amount / MONTHS[p.duration]), p.currency) : null,
  }));
  const plans = PLANS.filter((p) => offers.some((o) => o.plan === p.code));
  const open = mode && process.env.LICENSE_PRIVATE_KEY && offers.length > 0;
  return (
    <div className="card p-6">
      <h1 className="text-lg font-semibold text-slate-900">Acheter une licence ZE Gestion</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">Pour le logiciel installé sur ordinateur. La clé est créée dès que le paiement est confirmé, et le logiciel s&apos;active tout seul.</p>
      {mode === "simulation" && (
        <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Mode test.</b> Aucun argent n&apos;est prélevé : à l&apos;étape suivante, vous choisissez si le paiement réussit ou échoue.
        </p>
      )}
      {open ? (
        <OrderForm action={createOrderAction} offers={offers} plans={plans} installId={code ?? ""} />
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">La vente en ligne n&apos;est pas encore ouverte. Contactez ZE GROUP pour recevoir votre code de licence.</p>
      )}
    </div>
  );
}
