import { sql } from "drizzle-orm";
import { db, type Tx } from "./index";

export type TenantContext = {
  companyId: string;
  userId: string | null;
  /** Fuseau de l'entreprise : les calculs par jour en SQL (date_trunc…) se font dans son heure locale. */
  company?: { timezone?: string | null };
};

/**
 * Exécute fn dans une transaction où PostgreSQL connaît l'entreprise courante.
 * Les policies RLS filtrent alors toutes les tables métier sur ce company_id :
 * une requête qui oublierait son `where company_id` ne peut pas lire une autre entreprise.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.company_id', ${ctx.companyId}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    const tz = ctx.company?.timezone;
    if (tz && /^[A-Za-z0-9_+\-/]+$/.test(tz)) await tx.execute(sql`select set_config('TimeZone', ${tz}, true)`);
    return fn(tx);
  });
}

/** Transaction limitée à l'utilisateur (sans entreprise) : sert à lister ses adhésions. */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
