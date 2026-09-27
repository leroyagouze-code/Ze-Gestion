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

export const db: Db = drizzle(pool, { schema });
export { schema };
