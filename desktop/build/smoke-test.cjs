// Test sans interface : démarre PostgreSQL, les migrations et le serveur, vérifie la page de connexion, puis arrête.
// Usage : ZE_PG_BIN=/usr/lib/postgresql/16/bin [ZE_RESOURCES=dist/…/resources] node build/smoke-test.cjs [dossier-de-donnees]
const os = require("node:os");
const path = require("node:path");
const { startServices } = require("../services.cjs");

(async () => {
  const dataDir = process.argv[2] || path.join(os.tmpdir(), "ze-gestion-smoke");
  const s = await startServices({ resourcesDir: process.env.ZE_RESOURCES || path.join(__dirname, "..", "app"), dataDir, pgBin: process.env.ZE_PG_BIN, log: console.log });
  const res = await fetch(`${s.url}/login`);
  console.log("GET /login", res.status);
  if (process.env.ZE_KEEP) return console.log("Laissé en marche :", s.url);
  await s.stop();
  process.exit(res.status === 200 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
