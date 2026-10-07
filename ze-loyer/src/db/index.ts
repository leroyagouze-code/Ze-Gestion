import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __zlPool?: Pool };

const pool =
  globalForDb.__zlPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") globalForDb.__zlPool = pool;

export const db: Db = drizzle(pool, { schema });
export { pool, schema };
