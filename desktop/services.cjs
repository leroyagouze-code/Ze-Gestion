// Démarre les services du logiciel de bureau : PostgreSQL intégré, migrations, serveur Next.js.
// Utilisé par main.cjs (Electron) ; testable avec Node seul (voir build/smoke-test.cjs).
const { fork, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const DB_NAME = "zegestion";
const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

function loadConfig(dataDir) {
  const file = path.join(dataDir, "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  let changed = false;
  for (const key of ["pgPassword", "appPassword"]) {
    if (!cfg[key]) {
      cfg[key] = crypto.randomBytes(18).toString("hex");
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
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

function run(bin, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      log(`${path.basename(bin)} ${args.join(" ")} -> ${code}\n${out.trim()}`);
      code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} a échoué (code ${code}) : ${out.trim().slice(-500)}`));
    });
  });
}

// Écoute uniquement en local ; sous Linux et Mac, socket Unix dans le dossier de données (pas /var/run)
const pgOptions = (port, pgData) => `-p ${port} -h 127.0.0.1` + (process.platform === "win32" ? "" : ` -k "${pgData}"`);

async function startPostgres({ pgBin, dataDir, cfg, log }) {
  const pgData = path.join(dataDir, "pgdata");
  const pgCtl = path.join(pgBin, exe("pg_ctl"));
  if (!fs.existsSync(path.join(pgData, "PG_VERSION"))) {
    log("Création de la base de données locale");
    fs.mkdirSync(pgData, { recursive: true });
    const pwfile = path.join(dataDir, ".pwfile");
    fs.writeFileSync(pwfile, cfg.pgPassword, { mode: 0o600 });
    try {
      await run(path.join(pgBin, exe("initdb")), ["-D", pgData, "-U", "postgres", `--pwfile=${pwfile}`, "-A", "scram-sha-256", "-E", "UTF8", "--no-locale"], log);
    } finally {
      fs.rmSync(pwfile, { force: true });
    }
  }
  // Un PostgreSQL resté ouvert (arrêt brutal du PC ou du logiciel) est arrêté proprement avant de relancer
  await run(pgCtl, ["stop", "-D", pgData, "-m", "fast", "-w"], log).catch(() => {});
  const port = await freePort(54329);
  await run(pgCtl, ["start", "-D", pgData, "-w", "-t", "90", "-l", path.join(dataDir, "logs", "postgres.log"), "-o", pgOptions(port, pgData)], log);
  return { port, stop: () => run(pgCtl, ["stop", "-D", pgData, "-m", "fast", "-w"], log).catch(() => {}) };
}

async function migrate({ resourcesDir, port, cfg, log }) {
  const { Client, Pool } = require("pg");
  const admin = (db) => `postgres://postgres:${cfg.pgPassword}@127.0.0.1:${port}/${db}`;
  const c = new Client({ connectionString: admin("postgres") });
  await c.connect();
  const { rowCount } = await c.query("select 1 from pg_database where datname = $1", [DB_NAME]);
  if (!rowCount) await c.query(`create database ${DB_NAME}`);
  await c.end();

  const pool = new Pool({ connectionString: admin(DB_NAME) });
  const role = await pool.query("select 1 from pg_roles where rolname = 'app_user'");
  await pool.query(`${role.rowCount ? "alter" : "create"} role app_user with login password '${cfg.appPassword}' nosuperuser nobypassrls`);
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { migrate: run } = require("drizzle-orm/node-postgres/migrator");
  await run(drizzle(pool), { migrationsFolder: path.join(resourcesDir, "drizzle") });
  await pool.query(`grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    revoke update, delete on audit_logs from app_user;`);
  await pool.end();
  log("Migrations appliquées");
}

function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          res.statusCode < 500 ? resolve() : retry();
        })
        .on("error", retry);
    };
    const retry = () => (Date.now() - start > timeoutMs ? reject(new Error("Le serveur de l'application ne répond pas")) : setTimeout(attempt, 300));
    attempt();
  });
}

async function startServices({ resourcesDir, dataDir, pgBin, log = () => {} }) {
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  const logFile = fs.createWriteStream(path.join(dataDir, "logs", "app.log"), { flags: "a" });
  const write = (m) => {
    logFile.write(`[${new Date().toISOString()}] ${m}\n`);
    log(m);
  };
  const cfg = loadConfig(dataDir);
  const pg = await startPostgres({ pgBin, dataDir, cfg, log: write });
  try {
    await migrate({ resourcesDir, port: pg.port, cfg, log: write });
    const port = await freePort(3789);
    // Next.js construit ses redirections avec « localhost » : même hôte partout pour garder le cookie de session
    const url = `http://localhost:${port}`;
    const serverDir = path.join(resourcesDir, "server");
    const server = fork(path.join(serverDir, "server.js"), [], {
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        DATABASE_URL: `postgres://app_user:${cfg.appPassword}@127.0.0.1:${pg.port}/${DB_NAME}`,
        APP_URL: url,
        UPLOAD_DIR: path.join(dataDir, "uploads"),
        ZE_EDITION: "desktop",
      },
    });
    server.stdout.on("data", (d) => logFile.write(d));
    server.stderr.on("data", (d) => logFile.write(d));
    await waitForHttp(`http://127.0.0.1:${port}/login`);
    write(`Application prête sur ${url}`);
    return {
      url,
      async stop() {
        server.kill();
        await pg.stop();
        write("Arrêt");
        logFile.end();
      },
    };
  } catch (e) {
    await pg.stop();
    throw e;
  }
}

module.exports = { startServices };
