// Démarre ZE Gestion sur Android, dans le Node de nodejs-mobile (un seul processus, pas de fork) :
//   base PostgreSQL embarquée (PGlite, WebAssembly) servie en local, migrations, puis serveur Next.js.
// Usage : node main.cjs <dossier de données>. Quand l'appli répond, écrit <données>/ready.json { url }.
// Testable sur un PC : node main.cjs /tmp/ze-android
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// Node 18 (nodejs-mobile) : CustomEvent n'est pas global, pglite-socket s'en sert
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail ?? null;
    }
  };
}

// Node 18 : File n'est pas global (formulaires avec fichier dans Next.js)
if (typeof globalThis.File === "undefined") globalThis.File = require("node:buffer").File;

const here = __dirname;
const dataDir = path.resolve(process.argv[2] || process.env.ZE_DATA_DIR || path.join(here, "data"));
const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));

fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
const logFile = fs.createWriteStream(path.join(dataDir, "logs", "app.log"), { flags: "a" });
const log = (m) => {
  logFile.write(`[${new Date().toISOString()}] ${m}\n`);
  console.log(m);
};
const readyFile = path.join(dataDir, "ready.json");
fs.rmSync(readyFile, { force: true });

function loadConfig() {
  const file = path.join(dataDir, "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  // Code d'installation (licence) : 8 caractères Crockford, propre à ce téléphone, affiché XXXX-XXXX
  if (!cfg.installId) {
    const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let bits = 0n;
    for (const x of crypto.randomBytes(5)) bits = (bits << 8n) | BigInt(x);
    let id = "";
    for (let i = 7; i >= 0; i--) id += A[Number((bits >> BigInt(i * 5)) & 31n)];
    cfg.installId = `${id.slice(0, 4)}-${id.slice(4)}`;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  }
  return cfg;
}

function freePort(preferred) {
  const tryPort = (port) =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(null));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(port)));
    });
  return (async () => {
    for (let p = preferred; p < preferred + 50; p++) if (await tryPort(p)) return p;
    throw new Error(`Aucun port libre à partir de ${preferred}`);
  })();
}

function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () =>
      http
        .get(url, (res) => {
          res.resume();
          res.statusCode < 500 ? resolve() : retry();
        })
        .on("error", retry);
    const retry = () => (Date.now() - start > timeoutMs ? reject(new Error("Le serveur de l'application ne répond pas")) : setTimeout(attempt, 300));
    attempt();
  });
}

async function startDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const t = Date.now();
  const pgData = path.join(dataDir, "pgdata");
  const first = !fs.existsSync(pgData);
  const db = await PGlite.create({ dataDir: pgData, extensions: { pg_trgm } });
  log(`Base de données ${first ? "créée" : "ouverte"} en ${Date.now() - t} ms`);
  const port = await freePort(54329);
  // Un seul moteur : les connexions sont servies à tour de rôle, une transaction à la fois (voir src/db/index.ts, DB_EMBEDDED)
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  return { db, port, server };
}

async function migrate(port) {
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { migrate: run } = require("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: `postgres://postgres@127.0.0.1:${port}/postgres`, max: 1 });
  // Les migrations donnent des droits à app_user : le rôle doit exister (PGlite se connecte toujours en postgres)
  const role = await pool.query("select 1 from pg_roles where rolname = 'app_user'");
  if (!role.rowCount) await pool.query("create role app_user nologin");
  await run(drizzle(pool), { migrationsFolder: path.join(here, "drizzle") });
  await pool.end();
  log("Migrations appliquées");
}

async function main() {
  log(`Démarrage de ZE Gestion ${pkg.version ?? ""} (Node ${process.version}, ${process.platform}/${process.arch})`);
  const cfg = loadConfig();
  const database = await startDatabase();
  await migrate(database.port);

  const port = await freePort(3789);
  // Next.js construit ses redirections avec « localhost » : même hôte partout pour garder le cookie de session
  const url = `http://localhost:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `postgres://postgres@127.0.0.1:${database.port}/postgres`,
    DB_EMBEDDED: "1",
    DB_POOL_MAX: "4",
    APP_URL: url,
    UPLOAD_DIR: path.join(dataDir, "uploads"),
    ZE_EDITION: "desktop",
    ZE_PLATFORM: "android",
    ZE_INSTALL_ID: cfg.installId,
    ZE_APP_VERSION: process.env.ZE_APP_VERSION || pkg.version || "",
    ZE_SERVER_URL: process.env.ZE_SERVER_URL || cfg.serverUrl || pkg.zeGestion?.serverUrl || "",
  });
  await import(require("node:url").pathToFileURL(path.join(here, "server", "server.js")).href);
  await waitForHttp(`http://127.0.0.1:${port}/login`, 180_000);
  fs.writeFileSync(readyFile, JSON.stringify({ url, installId: cfg.installId }));
  log(`Application prête sur ${url}`);
}

main().catch((e) => {
  log(`Échec du démarrage : ${e?.stack ?? e}`);
  fs.writeFileSync(readyFile, JSON.stringify({ error: String(e?.message ?? e) }));
});
