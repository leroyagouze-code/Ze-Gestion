import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { todayISO } from "@/modules/finance/dates";
import { scopedLedgerRows } from "@/modules/dashboard/service";
import { PaymentForm } from "../payment-form";

export const metadata: Metadata = { title: "Enregistrer un paiement" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ location?: string; type?: string }> }) {
  const ctx = await requireStaff("payment.write");
  const sp = await searchParams;
  const rows = (await scopedLedgerRows(ctx)).filter((r) => r.leaseStatus === "ACTIVE" || r.leaseId === sp.location).sort((a, b) => a.tenantName.localeCompare(b.tenantName));
  const leases = rows.map((r) => ({
    id: r.leaseId,
    label: `${r.tenantName} — ${r.unitLabel} (${r.propertyName})`,
    rent: r.rentAmount,
    due: Math.max(0, r.situation.amountDue),
    advance: r.situation.advance,
  }));
  return (
    <>
      <PageHeader title="Enregistrer un paiement" subtitle="La quittance est créée automatiquement." back={{ href: "/paiements", label: "Paiements" }} />
      {leases.length ? (
        <PaymentForm leases={leases} selected={sp.location} defaultType={sp.type} today={todayISO()} canAdjust={can(ctx.permissions, "payment.cancel")} />
      ) : (
        <div className="card">
          <EmptyState icon="👥" title="Aucune location en cours">Ajoutez d&apos;abord un locataire dans un logement.</EmptyState>
        </div>
      )}
    </>
  );
}
