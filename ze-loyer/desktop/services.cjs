// Démarre les services du logiciel de bureau ZE LOYER : PostgreSQL intégré, migrations, données de démonstration
// (au premier lancement, si l'utilisateur le choisit), serveur Next.js.
// Utilisé par main.cjs (Electron) ; testable avec Node seul (voir build/smoke-test.cjs).
const { fork, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const DB_NAME = "zeloyer";
const APP_ROLE = "zl_app";
const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

function loadConfig(dataDir) {
  const file = path.join(dataDir, "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  let changed = false;
  for (const key of ["pgPassword", "appPassword", "cronSecret"]) {
    if (!cfg[key]) {
      cfg[key] = crypto.randomBytes(18).toString("hex");
      changed = true;
    }
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  if (changed) save();
  return { cfg, save };
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
    // « exit » et non « close » : sous Windows, postgres lancé par pg_ctl garde les sorties ouvertes
    child.on("exit", (code) => {
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
  const port = await freePort(54339);
  await run(pgCtl, ["start", "-D", pgData, "-w", "-t", "90", "-l", path.join(dataDir, "logs", "postgres.log"), "-o", pgOptions(port, pgData)], log);
  return { port, stop: () => run(pgCtl, ["stop", "-D", pgData, "-m", "fast", "-w"], log).catch(() => {}) };
}

const adminUrl = (port, cfg, db = DB_NAME) => `postgres://postgres:${cfg.pgPassword}@127.0.0.1:${port}/${db}`;

/** Crée la base, applique les migrations ZE LOYER et donne au compte de l'application les seuls droits utiles. Renvoie true si la base est vide. */
async function migrate({ resourcesDir, port, cfg, log }) {
  const { Client, Pool } = require("pg");
  const c = new Client({ connectionString: adminUrl(port, cfg, "postgres") });
  await c.connect();
  const { rowCount } = await c.query("select 1 from pg_database where datname = $1", [DB_NAME]);
  if (!rowCount) await c.query(`create database ${DB_NAME}`);
  await c.end();

  const pool = new Pool({ connectionString: adminUrl(port, cfg) });
  try {
    const role = await pool.query("select 1 from pg_roles where rolname = $1", [APP_ROLE]);
    await pool.query(`${role.rowCount ? "alter" : "create"} role ${APP_ROLE} with login password '${cfg.appPassword}' nosuperuser`);
    const { drizzle } = require("drizzle-orm/node-postgres");
    const { migrate: runMigrations } = require("drizzle-orm/node-postgres/migrator");
    await runMigrations(drizzle(pool), { migrationsFolder: path.join(resourcesDir, "drizzle") });
    // Journal d'audit en ajout seul et paiements jamais supprimés : protégés aussi par les droits (en plus des triggers)
    await pool.query(`grant usage on schema public to ${APP_ROLE};
      grant select, insert, update, delete on all tables in schema public to ${APP_ROLE};
      grant usage, select on all sequences in schema public to ${APP_ROLE};
      revoke update, delete on audit_logs from ${APP_ROLE};
      revoke delete on payments from ${APP_ROLE};`);
    const users = await pool.query("select count(*)::int as n from users");
    log("Migrations appliquées");
    return users.rows[0].n === 0;
  } finally {
    await pool.end();
  }
}

/** Données de démonstration (agence ZE IMMOBILIER…) : script seed.cjs construit par build/prepare.mjs. */
function seedDemo({ serverDir, port, cfg, write }) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(serverDir, "seed.cjs"), [], {
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", SEED_FORCE: "1", DATABASE_URL: adminUrl(port, cfg) },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      write(`Données de démonstration -> ${code}\n${out.trim()}`);
      code === 0 ? resolve() : reject(new Error(`Données de démonstration impossibles à créer : ${out.trim().slice(-500)}`));
    });
  });
}

// Premier démarrage : l'antivirus analyse les milliers de fichiers de l'application, d'où un délai généreux
function waitForHttp(url, timeoutMs = 180_000, failed = () => null) {
  const start = Date.now();
  let lastStatus = null;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const err = failed();
      if (err) return reject(err);
      http
        .get(url, (res) => {
          res.resume();
          lastStatus = res.statusCode;
          res.statusCode < 500 ? resolve() : retry();
        })
        .on("error", retry);
    };
    const retry = () => (Date.now() - start > timeoutMs ? reject(new Error(lastStatus ? `Le serveur de l'application répond en erreur (${lastStatus})` : "Le serveur de l'application ne répond pas")) : setTimeout(attempt, 300));
    attempt();
  });
}

/**
 * askDemo : appelée au premier lancement (base vide), renvoie true pour créer les données de démonstration.
 * status : message d'avancement affiché sur l'écran de démarrage.
 */
async function startServices({ resourcesDir, dataDir, pgBin, log = () => {}, askDemo = async () => false, status = () => {} }) {
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  const logFile = fs.createWriteStream(path.join(dataDir, "logs", "app.log"), { flags: "a" });
  const write = (m) => {
    logFile.write(`[${new Date().toISOString()}] ${m}\n`);
    log(m);
  };
  const { cfg, save } = loadConfig(dataDir);
  const serverDir = path.join(resourcesDir, "server");
  const pg = await startPostgres({ pgBin, dataDir, cfg, log: write });
  try {
    const empty = await migrate({ resourcesDir, port: pg.port, cfg, log: write });
    if (empty && !cfg.demoAsked) {
      const demo = await askDemo();
      if (demo) {
        status("Préparation des données de démonstration…");
        await seedDemo({ serverDir, port: pg.port, cfg, write });
      }
      cfg.demoAsked = true;
      save();
    }
    status("Démarrage en cours…");
    const port = await freePort(3790);
    // Next.js construit ses redirections avec « localhost » : même hôte partout pour garder le cookie de session
    const url = `http://localhost:${port}`;
    const server = fork(path.join(serverDir, "server.js"), [], {
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        DATABASE_URL: `postgres://${APP_ROLE}:${cfg.appPassword}@127.0.0.1:${pg.port}/${DB_NAME}`,
        APP_URL: url,
        UPLOAD_DIR: path.join(dataDir, "uploads"),
        CRON_SECRET: cfg.cronSecret,
      },
    });
    // Dernières lignes du serveur, reprises dans le message d'erreur
    let tail = "";
    const keep = (d) => {
      logFile.write(d);
      tail = (tail + d.toString()).slice(-8000);
    };
    server.stdout.on("data", keep);
    server.stderr.on("data", keep);
    let exited = null;
    server.on("error", (e) => (exited = e));
    // « close » : après la lecture complète de la sortie, pour citer la vraie erreur
    server.on("close", (code, signal) => {
      exited = new Error(`Le serveur de l'application s'est arrêté (code ${code ?? signal})`);
      write(exited.message);
    });
    write(`Démarrage du serveur sur le port ${port}`);
    try {
      await waitForHttp(`http://127.0.0.1:${port}/connexion`, 180_000, () => exited);
    } catch (e) {
      server.kill();
      write(`Échec : ${e.message}`);
      const lines = tail.trim().split("\n");
      const cause = lines.find((l) => /Error/.test(l)) ?? lines.slice(-3).join("\n");
      throw new Error(cause ? `${e.message}\n${cause.trim()}` : e.message);
    }
    write(`Application prête sur ${url}`);

    /** Rappels du jour (J-7 … J+7) : notifications dans l'application. */
    async function reminders() {
      try {
        const res = await fetch(`${url}/api/cron/rappels`, { headers: { authorization: `Bearer ${cfg.cronSecret}` } });
        write(`Rappels -> ${res.status} ${await res.text()}`);
      } catch (e) {
        write(`Rappels impossibles : ${e.message}`);
      }
    }

    return {
      url,
      reminders,
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
