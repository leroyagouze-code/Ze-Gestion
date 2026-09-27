// Installation de ZE Gestion sur un ordinateur, sans Docker.
// Prérequis : Node.js 22 et PostgreSQL 16 installés (voir docs/INSTALLATION-SANS-DOCKER.md).
// Lancement : Installer-ZE-Gestion-sans-Docker.bat (Windows) ou `node scripts/installer-local.mjs`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const DB_NAME = "zegestion";

function stop(message) {
  console.error(`\nERREUR : ${message}\n`);
  process.exit(1);
}

function run(title, command, env = {}) {
  console.log(`\n=== ${title} ===`);
  const childEnv = { ...process.env, ...env };
  delete childEnv.NODE_ENV; // la démo refuse de se charger en « production »
  const res = spawnSync(command, { shell: true, stdio: "inherit", env: childEnv });
  if (res.status !== 0) stop(`l'étape « ${title} » a échoué. Envoyez une capture de cette fenêtre.`);
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) stop(`Node.js ${process.versions.node} est trop ancien. Installez Node.js 22 (LTS) depuis https://nodejs.org`);

console.log("Installation de ZE Gestion (sans Docker)");
console.log("La première fois, comptez 5 à 15 minutes selon la connexion internet.");

// Mot de passe PostgreSQL : demandé une fois, puis gardé dans .env
const envFile = path.join(root, ".env");
const current = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
let adminUrl = current.DATABASE_ADMIN_URL;
const appPassword = current.APP_DB_PASSWORD || randomBytes(18).toString("hex");

if (!adminUrl) {
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => {
    process.stdout.write(q);
    const { value } = await lines.next();
    return (value ?? "").trim();
  };
  const pwd = await ask("\nMot de passe de l'utilisateur « postgres » (choisi pendant l'installation de PostgreSQL) : ");
  const port = (await ask("Port de PostgreSQL [5432] : ")) || "5432";
  rl.close();
  if (!pwd) stop("mot de passe vide.");
  adminUrl = `postgres://postgres:${encodeURIComponent(pwd)}@localhost:${port}/${DB_NAME}`;
}

run("Téléchargement des composants", existsSync("node_modules") ? "npm install --no-audit --no-fund" : "npm ci --no-audit --no-fund");

// Crée la base si besoin (connexion à la base « postgres » par défaut)
const { Client } = createRequire(import.meta.url)("pg");
const serverUrl = adminUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres");
const client = new Client({ connectionString: serverUrl });
try {
  await client.connect();
} catch (e) {
  if (existsSync(envFile) && current.DATABASE_ADMIN_URL) console.error("(Le mot de passe enregistré dans .env ne fonctionne plus : supprimez le fichier .env et relancez.)");
  stop(`connexion à PostgreSQL impossible (${e.message}). Vérifiez que PostgreSQL est installé et démarré, et le mot de passe.`);
}
const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [DB_NAME]);
if (!rowCount) {
  await client.query(`create database ${DB_NAME}`);
  console.log(`Base « ${DB_NAME} » créée.`);
}
await client.end();

const port = new URL(adminUrl).port || "5432";
writeFileSync(
  envFile,
  [
    "# Généré par scripts/installer-local.mjs : installation sur cet ordinateur",
    `DATABASE_ADMIN_URL=${adminUrl}`,
    `DATABASE_URL=postgres://app_user:${appPassword}@localhost:${port}/${DB_NAME}`,
    `APP_DB_PASSWORD=${appPassword}`,
    "APP_URL=http://localhost:3000",
    "UPLOAD_DIR=./uploads",
    `SUPPORT_CONTACT=${current.SUPPORT_CONTACT ?? ""}`,
    "",
  ].join("\n"),
);

run("Préparation de la base de données", "npx tsx scripts/migrate.ts");
run("Boutique de démonstration", "npx tsx --tsconfig tsconfig.json scripts/seed.ts");
run("Construction de l'application", "npm run build");

console.log("\n=== Installation terminée ===");
console.log("Double-cliquez sur « Demarrer-ZE-Gestion-sans-Docker.bat » pour ouvrir ZE Gestion.");
console.log("Connexion : demo@gestion.local / demo12345\n");
