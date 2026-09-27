// Assemble l'application Node pour Android dans android/app/src/main/assets/app.zip :
//   server/   build Next.js autonome (+ fichiers statiques, public), sans les modules natifs Linux
//   drizzle/  migrations SQL
//   main.cjs, package.json, node_modules/  démarrage (PGlite, pg, drizzle)
// Usage : node android/build/prepare.mjs [--skip-build] [--no-zip]
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const android = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(android, "..");
const args = new Set(process.argv.slice(2));
const out = path.join(android, "build", "nodejs-project");
const assets = path.join(android, "app", "src", "main", "assets");
const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

if (!args.has("--skip-build")) sh("npm run build");
if (!existsSync(path.join(root, ".next/standalone/server.js"))) throw new Error("Build Next.js autonome introuvable (.next/standalone)");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const server = path.join(out, "server");
cpSync(path.join(root, ".next/standalone"), server, { recursive: true, dereference: true });
cpSync(path.join(root, ".next/static"), path.join(server, ".next/static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
rmSync(path.join(server, ".env"), { force: true }); // jamais de secrets de développement dans l'appli
cpSync(path.join(root, "drizzle"), path.join(out, "drizzle"), { recursive: true });

// Modules natifs compilés pour Linux : inutilisables sur Android (argon2 passe en WebAssembly, sharp est facultatif)
const nm = path.join(server, "node_modules");
for (const scope of ["@node-rs", "@img"]) {
  const dir = path.join(nm, scope);
  if (!existsSync(dir)) continue;
  for (const d of readdirSync(dir)) if (/-(linux|darwin|win32|freebsd)-/.test(d) || d.startsWith("sharp-")) rmSync(path.join(dir, d), { recursive: true, force: true });
}
rmSync(path.join(nm, "sharp"), { recursive: true, force: true });

// Démarrage + ses dépendances
const version = JSON.parse(readFileSync(path.join(android, "app", "version.json"), "utf8")).versionName;
const pkg = JSON.parse(readFileSync(path.join(android, "node", "package.json"), "utf8"));
writeFileSync(path.join(out, "package.json"), JSON.stringify({ ...pkg, version }, null, 2));
cpSync(path.join(android, "node", "main.cjs"), path.join(out, "main.cjs"));
sh("npm install --omit=dev --no-audit --no-fund --ignore-scripts", out);

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(path.join(p, f)), 0) : statSync(p).size);
console.log(`Application Node prête dans ${out} (${Math.round(size(out) / 1e6)} Mo)`);

if (!args.has("--no-zip")) {
  mkdirSync(assets, { recursive: true });
  rmSync(path.join(assets, "app.zip"), { force: true });
  sh(`zip -qr -9 "${path.join(assets, "app.zip")}" .`, out);
  writeFileSync(path.join(assets, "app.version"), `${version}-${Date.now()}`);
  console.log(`assets/app.zip : ${Math.round(statSync(path.join(assets, "app.zip")).size / 1e6)} Mo`);
}
