// Test de l'APK ZE LOYER sur un émulateur Android (CI GitHub, version de TEST uniquement).
// Prérequis : émulateur démarré (adb), site ZE LOYER de démo joignable depuis l'émulateur (ZE_LOYER_URL,
// ex. http://10.0.2.2:3000), APK de test construit avec ZE_LOYER_ALLOW_HTTP=1 (débogage WebView activé).
// Parcours : ouverture → connexion de Kossi (locataire démo) → mon espace → quittances → téléchargement PDF
// → bouton retour Android → écran « Pas de connexion » quand le serveur est arrêté.
// Captures d'écran : dossier SMOKE_OUT (défaut ./smoke).
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const APK = process.env.SMOKE_APK ?? "android/app/build/outputs/apk/debug/app-debug.apk";
const OUT = process.env.SMOKE_OUT ?? "smoke";
const STOP_SERVER = process.env.SMOKE_STOP_SERVER; // commande qui arrête le site (étape hors ligne)
const PKG = "com.zegroup.zeloyer";
mkdirSync(OUT, { recursive: true });

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

function shot(name) {
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 50 * 1024 * 1024 });
  const file = `${OUT}/${String(++step).padStart(2, "0")}-${name}.png`;
  writeFileSync(file, png);
  log(`capture : ${file}`);
}

/**
 * Vérifie sur les pixels réels de l'écran que la page ZE LOYER est visible, et pas l'écran d'ouverture vert
 * (la WebView peut avoir chargé la page sans qu'elle soit affichée). Échantillons dans les marges haut/bas,
 * vertes sur l'écran d'ouverture, claires sur les pages de l'application.
 */
async function assertPageVisible(what) {
  const end = Date.now() + 20_000;
  for (;;) {
    try {
      return checkPixels(what);
    } catch (e) {
      if (Date.now() > end) {
        // Diagnostic : image rendue par la WebView elle-même (si elle montre la page, c'est l'affichage à l'écran qui bloque)
        try {
          const r = await cdp("Page.captureScreenshot", { format: "png" });
          if (r.result?.data) writeFileSync(`${OUT}/diagnostic-webview-${what.replace(/\W+/g, "-")}.png`, Buffer.from(r.result.data, "base64"));
        } catch {}
        throw e;
      }
      await sleep(1000);
    }
  }
}

function checkPixels(what) {
  const raw = execFileSync("adb", ["exec-out", "screencap"], { maxBuffer: 80 * 1024 * 1024 });
  const w = raw.readUInt32LE(0);
  const h = raw.readUInt32LE(4);
  const header = raw.length - w * h * 4;
  if (header < 12 || header > 16) throw new Error(`Capture d'écran brute illisible (${raw.length} octets, ${w}x${h})`);
  let green = 0;
  const pts = [];
  for (const fy of [0.15, 0.2, 0.75, 0.8]) {
    for (const fx of [0.08, 0.92]) {
      const o = header + (Math.floor(h * fy) * w + Math.floor(w * fx)) * 4;
      const [r, g, b] = [raw[o], raw[o + 1], raw[o + 2]];
      pts.push(`${r},${g},${b}`);
      // Vert ZE LOYER #0f5f3e (15,95,62), tolérance large
      if (r < 60 && g > 60 && g < 140 && b < 110) green++;
    }
  }
  if (green >= 6) throw new Error(`${what} : l'écran d'ouverture vert reste affiché au lieu de la page (pixels ${pts.join(" | ")})`);
  log(`écran vérifié (${what}) : page visible`);
}

async function waitFor(what, fn, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(1000);
  }
  throw new Error(`Délai dépassé : ${what}${last ? ` (${last.message})` : ""}`);
}

/* ── Pilotage de la WebView par le protocole DevTools ── */
let ws;
let seq = 0;
const pending = new Map();
async function connectWebView() {
  const socket = await waitFor("socket DevTools de la WebView", () => {
    const m = /@(webview_devtools_remote_\d+)/.exec(adb("shell", "cat", "/proc/net/unix"));
    return m?.[1];
  });
  adb("forward", "tcp:9222", `localabstract:${socket}`);
  const page = await waitFor("page ZE LOYER dans la WebView", async () => {
    const list = await (await fetch("http://127.0.0.1:9222/json")).json();
    return list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  });
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
}
function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => pending.set(id, res));
}
async function js(expression, { userGesture = false } = {}) {
  // userGesture : se comporte comme un vrai toucher du doigt (sinon Android bloque l'ouverture d'un lien « nouvel onglet »)
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
const page = () => js("({ path: location.pathname, href: location.href, text: document.body ? document.body.innerText : '' })");

/* ── Parcours ── */
async function main() {
  log("Installation de l'APK");
  adb("install", "-r", "-t", APK);
  adb("shell", "rm", "-f", "/sdcard/Download/quittance-*");
  adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);

  await connectWebView();
  let p = await waitFor("page de connexion", async () => {
    const x = await page();
    return x.path === "/connexion" && x.text.includes("Se connecter") ? x : null;
  });
  log(`Ouvert sur ${p.href}`);
  const ua = await js("navigator.userAgent");
  if (!ua.includes("ZeLoyerAndroid")) throw new Error(`User-Agent sans ZeLoyerAndroid : ${ua}`);
  await assertPageVisible("page de connexion");
  shot("connexion");

  log("Connexion de Kossi (90000003)");
  await js(`(() => {
    const f = document.querySelector('form');
    f.querySelector('input[name=identifier]').value = '90000003';
    f.querySelector('input[name=password]').value = 'zeloyer2026';
    f.requestSubmit();
    return true;
  })()`);
  p = await waitFor("espace locataire après connexion", async () => {
    const x = await page();
    return x.path === "/mon-espace" && x.text.includes("Bonjour Kossi") ? x : null;
  });
  if (!/Vous êtes à jour|Vous avez un solde|Vous êtes en avance/.test(p.text)) throw new Error("Situation du locataire absente de l'accueil");
  await assertPageVisible("espace locataire");
  shot("mon-espace");

  log("Quittances");
  await js("location.href = '/mon-espace/quittances'; true");
  await waitFor("page des quittances", async () => {
    const x = await page();
    return x.path === "/mon-espace/quittances" && x.text.includes("Mes quittances") ? x : null;
  });
  const href = await js("(document.querySelector(\"a[href*='/api/quittances/']\") || {}).href || null");
  if (!href) throw new Error("Aucune quittance à télécharger");
  await assertPageVisible("page des quittances");
  shot("quittances");

  log(`Téléchargement de ${href}`);
  await js("document.querySelector(\"a[href*='/api/quittances/']\").click(); true", { userGesture: true });
  const file = await waitFor("PDF dans Téléchargements", () => {
    const ls = adb("shell", "ls", "/sdcard/Download/");
    return ls.split(/\s+/).find((f) => /^quittance-ZL-\d{4}-\d{6}.*\.pdf$/.test(f)) ?? null;
  });
  const head = await waitFor("contenu du PDF", () => {
    const h = adb("shell", "head", "-c", "5", `/sdcard/Download/${file}`);
    return h.startsWith("%PDF") ? h : null;
  });
  log(`PDF téléchargé : ${file} (${head})`);
  shot("telechargement");

  log("Bouton retour Android");
  p = await page();
  if (p.path !== "/mon-espace/quittances") throw new Error(`Le téléchargement a quitté la page (${p.path})`);
  adb("shell", "input", "keyevent", "4");
  await waitFor("retour à l'accueil du locataire", async () => (await page()).path === "/mon-espace");
  shot("retour");

  if (STOP_SERVER) {
    log("Serveur arrêté → écran « Pas de connexion »");
    execSync(STOP_SERVER, { stdio: "inherit", shell: "/bin/bash" });
    await sleep(2000);
    await js("location.reload(); true").catch(() => undefined);
    await sleep(3000);
    // La WebView a navigué vers la page locale : on se reconnecte à la cible DevTools
    ws.close();
    await connectWebView();
    await waitFor("écran hors ligne", async () => (await page()).text.includes("Pas de connexion"), 60_000);
    shot("hors-ligne");
  }

  log("✅ Parcours Android réussi");
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  try {
    shot("echec");
    writeFileSync(`${OUT}/logcat.txt`, adb("logcat", "-d", "-t", "2000"));
  } catch {}
  process.exit(1);
});
