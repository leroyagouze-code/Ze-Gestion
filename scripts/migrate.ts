import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
  const pwd = process.env.APP_DB_PASSWORD;
  if (!pwd) throw new Error("APP_DB_PASSWORD manquant");
  // Rôle applicatif soumis à la RLS (créé avant les migrations qui lui donnent ses droits)
  const { rowCount } = await pool.query("select 1 from pg_roles where rolname = 'app_user'");
  const escaped = pwd.replace(/'/g, "''");
  await pool.query(
    rowCount
      ? `alter role app_user with login password '${escaped}' nosuperuser nobypassrls`
      : `create role app_user login password '${escaped}' nosuperuser nobypassrls`,
  );
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  // Les droits sont redonnés à chaque migration pour couvrir les nouvelles tables
  await pool.query(`grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    revoke update, delete on audit_logs from app_user;`);
  await pool.end();
  console.log("Migrations appliquées.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
