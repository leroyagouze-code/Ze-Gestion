// Récupère Node.js pour Android (paquet nodejs-lts de Termux, compilé pour Android avec ICU complet)
// et le range dans app/src/main/jniLibs/<abi>/ :
//   libzn_node.so        l'exécutable node (seul endroit d'où Android autorise à lancer un programme)
//   lib<nom><version>.so ses bibliothèques, renommées (Android n'emballe que des lib*.so : libz.so.1 -> libz1.so)
// Le Node de nodejs-mobile ne convient pas : compilé sans Intl (dates, montants, expressions \p{…}).
// Usage : node android/build/fetch-node.mjs [abi…]   (défaut : arm64-v8a armeabi-v7a x86_64). Besoin de ar et tar.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
      const soname = readDynamic(readFileSync(real)).soname || f;
      bySoname.set(soname, real);
      bySoname.set(f, real);
    } catch {}
  }

  const out = path.join(android, "app/src/main/jniLibs", abi);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const done = new Map(); // soname d'origine -> nom dans l'APK
  const place = (src, name) => {
    const buf = readFileSync(src);
    const renames = new Map();
    const { soname, needed } = readDynamic(buf);
    if (soname && soname !== name) renames.set(soname, name);
    for (const n of needed) {
      if (SYSTEM.has(n)) continue;
      const dep = bySoname.get(n);
      if (!dep) throw new Error(`${path.basename(src)} a besoin de ${n}, introuvable`);
      if (!done.has(n)) {
        done.set(n, apkName(n));
        place(dep, apkName(n));
      }
      if (done.get(n) !== n) renames.set(n, done.get(n));
    }
    renameInDynstr(buf, renames);
    writeFileSync(path.join(out, name), buf);
  };
  const node = path.join(usr, "bin/node");
  if (!existsSync(node)) throw new Error("node absent du paquet nodejs-lts");
  place(realpathSync(node), "libzn_node.so");
  // Diagnostic (CI) : copie telle quelle du Node de Termux, pour la comparer à la version renommée
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

// Nom accepté par Android (lib*.so) et jamais plus long que l'original : libz.so.1 -> libz1.so.
// Plus court, il s'écrit à la place de l'ancien dans la table des chaînes, sans rien déplacer :
// patchelf, qui agrandit cette table, produit des fichiers qui plantent le chargeur d'Android (version needed).
function apkName(soname) {
  if (/^lib.*\.so$/.test(soname)) return soname;
  const m = /^(lib.*)\.so\.([0-9.]+)$/.exec(soname);
  if (!m) throw new Error(`Nom de bibliothèque inattendu : ${soname}`);
  return `${m[1]}${m[2].replace(/\./g, "")}.so`;
}

/** Lit la section .dynstr et les entrées NEEDED / SONAME d'un fichier ELF (32 ou 64 bits, petit-boutiste). */
function readDynamic(buf) {
  if (buf.readUInt32BE(0) !== 0x7f454c46) throw new Error("pas un fichier ELF");
  const is64 = buf[4] === 2;
  const rd = (off) => (is64 ? Number(buf.readBigUInt64LE(off)) : buf.readUInt32LE(off));
  const shoff = is64 ? Number(buf.readBigUInt64LE(0x28)) : buf.readUInt32LE(0x20);
  const shentsize = buf.readUInt16LE(is64 ? 0x3a : 0x2e);
  const shnum = buf.readUInt16LE(is64 ? 0x3c : 0x30);
  const sections = [];
  for (let i = 0; i < shnum; i++) {
    const o = shoff + i * shentsize;
    sections.push({
      type: buf.readUInt32LE(o + 4),
      offset: is64 ? Number(buf.readBigUInt64LE(o + 0x18)) : buf.readUInt32LE(o + 0x10),
      size: is64 ? Number(buf.readBigUInt64LE(o + 0x20)) : buf.readUInt32LE(o + 0x14),
      link: buf.readUInt32LE(o + (is64 ? 0x28 : 0x18)),
    });
  }
  const dyn = sections.find((x) => x.type === 6); // SHT_DYNAMIC
  if (!dyn) throw new Error("pas de section dynamique");
  const dynstr = sections[dyn.link];
  const str = (off) => {
    const start = dynstr.offset + off;
    return buf.toString("latin1", start, buf.indexOf(0, start));
  };
  const needed = [];
  let soname = null;
  const entsize = is64 ? 16 : 8;
  for (let o = dyn.offset; o < dyn.offset + dyn.size; o += entsize) {
    const tag = rd(o);
    const val = rd(o + entsize / 2);
    if (tag === 0) break;
    if (tag === 1) needed.push(str(val));
    if (tag === 14) soname = str(val);
  }
  return { needed, soname, dynstr };
}

/** Remplace des noms dans .dynstr sur place (même emplacement, complété par des zéros). */
function renameInDynstr(buf, renames) {
  if (!renames.size) return;
  const { dynstr } = readDynamic(buf);
  const end = dynstr.offset + dynstr.size;
  for (const [from, to] of renames) {
    if (Buffer.byteLength(to) > Buffer.byteLength(from)) throw new Error(`${to} plus long que ${from}`);
    const needle = Buffer.from(`\0${from}\0`, "latin1");
    let found = 0;
    for (let i = buf.indexOf(needle, dynstr.offset - 1); i !== -1 && i < end; i = buf.indexOf(needle, i + 1)) {
      const repl = Buffer.alloc(from.length, 0);
      repl.write(to, "latin1");
      repl.copy(buf, i + 1);
      found++;
    }
    if (!found) throw new Error(`${from} absent de la table des chaînes`);
  }
}

for (const abi of abis) await forAbi(abi);
