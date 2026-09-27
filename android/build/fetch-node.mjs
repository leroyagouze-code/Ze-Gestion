// Récupère Node.js pour Android (paquet nodejs-lts de Termux, compilé pour Android avec ICU complet)
// et le range dans app/src/main/jniLibs/<abi>/ :
//   libzn_node.so        l'exécutable node (seul endroit d'où Android autorise à lancer un programme)
//   libzn_<nom>.so       ses bibliothèques, renommées (Android n'emballe que des lib*.so) et reliées avec patchelf
// Le Node de nodejs-mobile ne convient pas : compilé sans Intl (dates, montants, expressions \p{…}).
// Usage : node android/build/fetch-node.mjs [abi…]   (défaut : arm64-v8a armeabi-v7a x86_64). Besoin de ar, tar, patchelf.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.TERMUX_REPO ?? "https://packages-cf.termux.dev/apt/termux-main";
const ARCH = { "arm64-v8a": "aarch64", "armeabi-v7a": "arm", x86_64: "x86_64" };
// Bibliothèques fournies par Android lui-même
const SYSTEM = new Set(["libc.so", "libm.so", "libdl.so", "liblog.so", "libandroid.so"]);
const PREFIX = "data/data/com.termux/files/usr";

const android = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const abis = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ARCH);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

async function get(url) {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (i >= 3) throw new Error(`${url} : ${r.status}`);
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
}

function parseIndex(text) {
  const pkgs = new Map();
  for (const block of text.split(/\n\n+/)) {
    const f = {};
    for (const line of block.split("\n")) {
      const m = /^([A-Za-z-]+): (.*)$/.exec(line);
      if (m) f[m[1]] = m[2];
    }
    if (f.Package) pkgs.set(f.Package, f);
    if (f.Provides) for (const p of f.Provides.split(",")) pkgs.set(p.trim().split(" ")[0], pkgs.get(p.trim().split(" ")[0]) ?? f);
  }
  return pkgs;
}

function closure(pkgs, root) {
  const seen = new Map();
  const visit = (name) => {
    if (seen.has(name)) return;
    const p = pkgs.get(name);
    if (!p) throw new Error(`Paquet Termux introuvable : ${name}`);
    seen.set(name, p);
    for (const dep of (p.Depends ?? "").split(",").filter(Boolean)) visit(dep.split("|")[0].trim().split(" ")[0]);
  };
  visit(root);
  return [...seen.values()];
}

async function forAbi(abi) {
  const arch = ARCH[abi];
  if (!arch) throw new Error(`Architecture inconnue : ${abi}`);
  const index = (await get(`${REPO}/dists/stable/main/binary-${arch}/Packages`)).toString("utf8");
  const pkgs = closure(parseIndex(index), "nodejs-lts");
  const work = mkdtempSync(path.join(tmpdir(), `zn-${arch}-`));
  const root = path.join(work, "root");
  mkdirSync(root);
  for (const p of pkgs) {
    const deb = path.join(work, path.basename(p.Filename));
    writeFileSync(deb, await get(`${REPO}/${p.Filename}`));
    const x = path.join(work, `x-${p.Package}`);
    mkdirSync(x);
    run("ar", ["x", deb], { cwd: x });
    const data = readdirSync(x).find((f) => f.startsWith("data.tar"));
    run("tar", ["-xf", path.join(x, data), "-C", root]);
  }
  console.log(`${abi} : ${pkgs.map((p) => `${p.Package} ${p.Version}`).join(", ")}`);

  const usr = path.join(root, PREFIX);
  const libDir = path.join(usr, "lib");
  // soname -> fichier réel
  const bySoname = new Map();
  for (const f of readdirSync(libDir)) {
    const full = path.join(libDir, f);
    if (!/\.so(\.|$)/.test(f) || lstatSync(full).isDirectory()) continue;
    const real = realpathSync(full);
    try {
      const soname = run("patchelf", ["--print-soname", real]) || f;
      bySoname.set(soname, real);
      bySoname.set(f, real);
    } catch {}
  }
  const nameFor = (soname) => `libzn_${soname.replace(/^lib/, "").replace(/[^A-Za-z0-9]/g, "_")}.so`;

  const out = path.join(android, "app/src/main/jniLibs", abi);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const done = new Map(); // fichier réel -> nom dans l'APK
  const place = (src, name, soname) => {
    const dest = path.join(out, name);
    copyFileSync(src, dest);
    const args = ["--remove-rpath"];
    if (soname) args.push("--set-soname", name);
    for (const needed of run("patchelf", ["--print-needed", src]).split("\n").filter(Boolean)) {
      if (SYSTEM.has(needed)) continue;
      const dep = bySoname.get(needed);
      if (!dep) throw new Error(`${path.basename(src)} a besoin de ${needed}, introuvable`);
      if (!done.has(dep)) {
        done.set(dep, nameFor(needed));
        place(dep, nameFor(needed), true);
      }
      args.push("--replace-needed", needed, done.get(dep));
    }
    run("patchelf", [...args, dest]);
  };
  const node = path.join(usr, "bin/node");
  if (!existsSync(node)) throw new Error("node absent du paquet nodejs-lts");
  place(realpathSync(node), "libzn_node.so", false);
  // Diagnostic (CI) : copie telle quelle du Node de Termux, pour la comparer à la version reliée par patchelf
  if (process.env.ZE_KEEP_RAW) {
    const raw = path.join(process.env.ZE_KEEP_RAW, abi);
    rmSync(raw, { recursive: true, force: true });
    mkdirSync(path.join(raw, "lib"), { recursive: true });
    copyFileSync(realpathSync(node), path.join(raw, "node"));
    for (const [name, real] of bySoname) copyFileSync(real, path.join(raw, "lib", name));
  }
  const files = readdirSync(out);
  console.log(`${abi} : ${files.length} fichiers dans jniLibs (${files.join(" ")})`);
  rmSync(work, { recursive: true, force: true });
}

for (const abi of abis) await forAbi(abi);
