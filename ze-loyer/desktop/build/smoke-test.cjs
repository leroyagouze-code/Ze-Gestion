// Test sans interface : démarre PostgreSQL, les migrations, les données de démonstration et le serveur,
// vérifie la page de connexion et les rappels, puis, dans un vrai navigateur (Chrome) : connexion de l'agence de démo,
// paiement de 75 000 F pour Kossi, quittance PDF. Arrête tout à la fin.
// Usage : ZE_PG_BIN=/usr/lib/postgresql/16/bin [ZE_RESOURCES=dist/…/resources] [ZE_CHROME=chemin/de/chromium] node build/smoke-test.cjs [dossier-de-donnees]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startServices } = require("../services.cjs");

(async () => {
  const dataDir = process.argv[2] || path.join(os.tmpdir(), "ze-loyer-smoke");
  fs.rmSync(dataDir, { recursive: true, force: true }); // premier lancement à chaque test
  let asked = false;
  const s = await startServices({
    resourcesDir: process.env.ZE_RESOURCES || path.join(__dirname, "..", "app"),
    dataDir,
    pgBin: process.env.ZE_PG_BIN,
    log: console.log,
    askDemo: async () => (asked = true),
  });
  const check = (ok, what) => {
    if (!ok) throw new Error(`Échec : ${what}`);
    console.log(`OK : ${what}`);
  };
  check(asked, "données de démonstration proposées au premier lancement");
  const page = await fetch(`${s.url}/connexion`);
  check(page.status === 200 && (await page.text()).includes("Se connecter"), "page de connexion");
  const health = await fetch(`${s.url}/api/health`);
  check(health.status === 200, "/api/health");
  const reminders = await fetch(`${s.url}/api/cron/rappels`, { headers: { authorization: `Bearer ${JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8")).cronSecret}` } });
  check(reminders.status === 200, `rappels (${await reminders.text()})`);
  await browserJourney(s.url, check);
  if (process.env.ZE_KEEP) return console.log("Laissé en marche :", s.url);
  await s.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function browserJourney(url, check) {
  const { chromium } = require("playwright-core");
  // Chrome installé (machines GitHub Windows) ou Chromium indiqué par ZE_CHROME
  const browser = await chromium.launch(process.env.ZE_CHROME ? { executablePath: process.env.ZE_CHROME } : { channel: "chrome" });
  try {
    const p = await browser.newPage();
    await p.goto(`${url}/connexion`, { waitUntil: "networkidle" });
    await p.fill("input[name=identifier]", "90000001");
    await p.fill("input[name=password]", "zeloyer2026");
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 60_000 }), p.click("button[type=submit]")]);
    check(new URL(p.url()).pathname === "/tableau-de-bord", "connexion de l'agence de démo (cookie de session sur localhost)");
    // Attendre que la page soit complètement chargée (formulaire interactif) avant de le remplir
    await p.goto(`${url}/paiements/nouveau`, { waitUntil: "networkidle" });
    const options = await p.$$eval("select[name=leaseId] option", (o) => o.map((x) => [x.value, x.textContent]));
    const kossi = options.find(([, t]) => /Kossi Mensah/.test(t));
    check(kossi, "location de Kossi Mensah dans les données de démo");
    await p.selectOption("select[name=leaseId]", kossi[0]);
    await p.fill("input[name=amount]", "75000");
    await p.click("button[type=submit]");
    try {
      await p.waitForURL(/\/paiements\/[0-9a-f-]{36}/, { timeout: 60_000, waitUntil: "commit" });
    } catch (e) {
      // Diagnostic : ce que la page affiche (message d'erreur du formulaire ?)
      await p.screenshot({ path: path.join(process.env.ZE_DIAG_DIR || os.tmpdir(), "ze-loyer-echec-paiement.png"), fullPage: true }).catch(() => {});
      console.error(`Page après « Enregistrer » (${p.url()}) :\n${(await p.innerText("main").catch(() => "")).slice(0, 1500)}`);
      throw e;
    }
    check(true, "paiement de 75 000 F enregistré (droits limités du compte de l'application)");
    const href = await p.getAttribute("a[href*='/api/quittances/']", "href");
    const pdf = await p.request.get(url + href);
    const body = await pdf.body();
    check(pdf.status() === 200 && body.subarray(0, 4).toString() === "%PDF", `quittance PDF (${pdf.status()}, ${body.length} octets)`);
  } finally {
    await browser.close();
  }
}
