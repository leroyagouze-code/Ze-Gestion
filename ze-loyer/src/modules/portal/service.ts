import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, owners, payments, receipts } from "@/db/schema";
import { getTenantLease } from "../access";
import { todayISO } from "../finance/dates";
import { listDeposits, listReceiptsForLease, loadLedgers, syncLeases } from "../finance/service";

/** Tout ce que voit le locataire : son logement, sa situation, son historique. Rien d'autre. */
export async function tenantOverview(userId: string, leaseId?: string, today = todayISO()) {
  const { current, all } = await getTenantLease(userId, leaseId);
  if (!current) return { current: null, all, situation: null, payments: [], deposits: [], receipts: [], ownerName: null, orgName: null };
  await syncLeases([current.lease], today);
  const situation = (await loadLedgers(db, [current.lease], today)).get(current.lease.id)!;
  const [paymentRows, depositRows, receiptRows, [owner], [org]] = await Promise.all([
    db
      .select({ payment: payments, receiptId: receipts.id })
      .from(payments)
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(eq(payments.leaseId, current.lease.id))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt)),
    listDeposits(current.lease.id),
    listReceiptsForLease(current.lease.id),
    db.select({ fullName: owners.fullName }).from(owners).where(eq(owners.id, current.property.ownerId)).limit(1),
    db.select({ name: organizations.name, kind: organizations.kind }).from(organizations).where(eq(organizations.id, current.lease.organizationId)).limit(1),
  ]);
  return { current, all, situation, payments: paymentRows, deposits: depositRows, receipts: receiptRows, ownerName: owner?.fullName ?? null, orgName: org.kind === "AGENCY" ? org.name : null };
}

