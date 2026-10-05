// Assemble ZE LOYER pour le logiciel de bureau dans ze-loyer/desktop/app :
//   server/  build Next.js autonome (+ fichiers statiques, public, binaire argon2 de la cible, seed.cjs des données de démo)
//   drizzle/ migrations SQL
//   pgsql/   PostgreSQL 16 de la cible (Windows : binaires zonky via @embedded-postgres)
// Usage : node build/prepare.mjs --target=win|linux [--skip-build]
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, ".."); // ze-loyer/
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const target = args.target ?? (process.platform === "win32" ? "win" : "linux");
const PG_VERSION = "16.14.0-beta.17";
const out = path.join(desktop, "app");
const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

/** Télécharge un paquet npm et renvoie le dossier extrait (sans l'installer). */
function fetchPackage(spec) {
  const dir = mkdtempSync(path.join(tmpdir(), "zl-"));
  const file = execSync(`npm pack ${spec} --silent`, { cwd: dir }).toString().trim().split("\n").pop();
  execSync(`tar xzf "${file}"`, { cwd: dir }); // tar est fourni par Windows 10+ et Linux
  return path.join(dir, "package");
}

if (!args["skip-build"]) sh("npm run build");
if (!existsSync(path.join(root, ".next/standalone/server.js"))) throw new Error("Build Next.js autonome introuvable (.next/standalone)");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const server = path.join(out, "server");
cpSync(path.join(root, ".next/standalone"), server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(root, ".next/static"), path.join(server, ".next/static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
// Jamais de secrets ni de fichiers de développement dans le logiciel
for (const f of [".env", ".env.local", "mobile", "desktop", "uploads"]) rmSync(path.join(server, f), { recursive: true, force: true });
cpSync(path.join(root, "drizzle"), path.join(out, "drizzle"), { recursive: true });

// Données de démonstration : scripts/seed.ts en un seul fichier ; argon2 (module natif) vient du serveur autonome
sh(
  [
    "npx esbuild scripts/seed.ts --bundle --platform=node --format=cjs --target=node22",
    `--outfile="${path.join(server, "seed.cjs")}"`,
    "--alias:server-only=./tests/server-only-stub.ts",
    "--external:pg-native --external:@node-rs/argon2 --log-level=warning",
  ].join(" "),
);

if (target === "win") {
  // Module natif de hachage des mots de passe pour Windows
  const argon = JSON.parse(readFileSync(path.join(root, "node_modules/@node-rs/argon2/package.json"), "utf8"));
  const v = argon.optionalDependencies["@node-rs/argon2-win32-x64-msvc"];
  cpSync(fetchPackage(`@node-rs/argon2-win32-x64-msvc@${v}`), path.join(server, "node_modules/@node-rs/argon2-win32-x64-msvc"), { recursive: true });
  // PostgreSQL pour Windows
  const pg = fetchPackage(`@embedded-postgres/windows-x64@${PG_VERSION}`);
  cpSync(path.join(pg, "native"), path.join(out, "pgsql"), { recursive: true });
  // Outils graphiques inutiles au serveur (wxWidgets de pgAdmin) : allège l'installateur
  for (const f of readdirSync(path.join(out, "pgsql/bin"))) {
    if (/^wx.*\.dll$/.test(f)) rmSync(path.join(out, "pgsql/bin", f));
  }
} else {
  // Linux (tests) : PostgreSQL du système, via ZE_PG_BIN
  mkdirSync(path.join(out, "pgsql/bin"), { recursive: true });
}
console.log(`Application prête pour « ${target} » dans ${out}`);
