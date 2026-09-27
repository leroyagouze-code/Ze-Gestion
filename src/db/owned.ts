import { and, eq, ne } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { paymentMethods } from "./schema";
import type { Tx } from "./index";
import { BusinessError, NotFoundError } from "@/lib/errors";

/**
 * Vérifie qu'un identifiant reçu du navigateur appartient à l'entreprise courante.
 * Les clés étrangères de PostgreSQL ignorent la RLS : sans ce contrôle, une ligne
 * pourrait pointer vers la boutique ou le produit d'une autre entreprise.
 * La requête passe par la RLS, donc un identifiant étranger est simplement introuvable.
 */
export async function assertOwned(tx: Tx, table: PgTable & { id: AnyPgColumn }, id: string | null | undefined, label: string) {
  if (!id) return;
  const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw new NotFoundError(label);
}

/** Moyen de paiement valable pour un encaissement réel : actif, et jamais « Crédit » (qui n'apporte pas d'argent). */
export async function assertCollectMethod(tx: Tx, id: string) {
  const [m] = await tx
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.isEnabled, true), ne(paymentMethods.type, "credit")))
    .limit(1);
  if (!m) throw new BusinessError("Moyen de paiement invalide pour un encaissement");
}
