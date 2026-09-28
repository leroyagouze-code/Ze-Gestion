import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __pool?: Pool };

// Rôle applicatif sans BYPASSRLS : les policies de 0002_rls.sql s'appliquent toujours.
const pool =
  globalForDb.__pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

const base: Db = drizzle(pool, { schema });

/**
 * Base embarquée (Android, PGlite) : un seul moteur, une transaction à la fois.
 * Une requête lancée avec `db` pendant une transaction attendrait la fin de celle-ci pour toujours ;
 * on la fait donc passer dans la transaction en cours.
 */
const current = new AsyncLocalStorage<Tx>();
const embedded: Db = new Proxy(base, {
  get(target, prop, receiver) {
    const tx = current.getStore();
    if (prop === "transaction") {
      return (fn: (tx: Tx) => Promise<unknown>, config?: unknown) =>
        tx
          ? tx.transaction(fn)
          : target.transaction((t) => current.run(t, () => fn(t)), config as never);
    }
    const src = tx ?? target;
    const v = Reflect.get(src, prop, tx ? src : receiver);
    return typeof v === "function" ? v.bind(src) : v;
  },
});

export const db: Db = process.env.DB_EMBEDDED === "1" ? embedded : base;
export { schema };
