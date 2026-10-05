// ZE LOYER, logiciel de bureau : lance les services locaux (base de données + serveur) puis ouvre l'application dans une fenêtre.
const { app, BrowserWindow, Menu, dialog, session, shell } = require("electron");
const path = require("node:path");
const { startServices } = require("./services.cjs");

const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, "app");
const pgBin = process.env.ZE_PG_BIN || path.join(resourcesDir, "pgsql", "bin");
const icon = path.join(__dirname, "icon.png");

let services = null;
let win = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(boot);
}

async function boot() {
  Menu.setApplicationMenu(null);
  const splash = new BrowserWindow({ width: 420, height: 260, frame: false, resizable: false, center: true, icon, backgroundColor: "#0f5f3e" });
  splash.loadFile(path.join(__dirname, "splash.html"));
  const status = (text) => splash.webContents.executeJavaScript(`document.getElementById("status").textContent = ${JSON.stringify(text)}`).catch(() => {});
  // Premier lancement : base vide → proposer les données de démonstration
  const askDemo = async () => {
    const { response } = await dialog.showMessageBox(splash, {
      type: "question",
      title: "ZE LOYER",
      message: "Bienvenue dans ZE LOYER",
      detail:
        "Voulez-vous découvrir le logiciel avec des données de démonstration ?\n\n" +
        "Agence ZE IMMOBILIER : 8 propriétaires, 14 immeubles, 126 logements, des locataires à jour, en retard ou en avance.\n" +
        "Connexion avec le téléphone 90000001 (agence) ou 90000003 (locataire), mot de passe zeloyer2026.\n\n" +
        "Sinon, vous commencez avec un logiciel vide et créez votre compte.",
      buttons: ["Avec les données de démonstration", "Commencer vide"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  };
  try {
    services = await startServices({ resourcesDir, dataDir: app.getPath("userData"), pgBin, log: (m) => console.log(m), askDemo, status });
  } catch (e) {
    splash.destroy();
    dialog.showErrorBox(
      "ZE LOYER n'a pas pu démarrer",
      `${e.message}\n\nJournal : ${path.join(app.getPath("userData"), "logs", "app.log")}\nEnvoyez ce message à ZE GROUP.`,
    );
    app.exit(1);
    return;
  }

  const origin = services.url;
  const isLocal = (url) => url === origin || url.startsWith(origin + "/");
  // Quittances PDF et documents : enregistrés dans « Téléchargements » puis ouverts avec le lecteur PDF de Windows
  const isFile = (url) => isLocal(url) && /^\/api\/(quittances|documents)\//.test(new URL(url).pathname);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(isLocal(wc.getURL()) && permission === "clipboard-sanitized-write"));
  session.defaultSession.on("will-download", (_e, item) => {
    const file = uniquePath(app.getPath("downloads"), item.getFilename());
    item.setSavePath(file);
    item.once("done", (_ev, state) => {
      if (state === "completed") shell.openPath(file);
      else dialog.showErrorBox("Téléchargement impossible", "Le fichier n'a pas pu être enregistré. Réessayez.");
    });
  });

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "ZE LOYER",
    icon,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isFile(url)) win.webContents.downloadURL(url);
    else if (isLocal(url)) return { action: "allow", overrideBrowserWindowOptions: { width: 900, height: 1000, icon, autoHideMenuBar: true } };
    // WhatsApp, appels, SMS, sites externes : applications de Windows / navigateur
    else shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isFile(url)) {
      e.preventDefault();
      win.webContents.downloadURL(url);
    } else if (!isLocal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  // Page précédente / suivante : Alt+← / Alt+→, boutons latéraux de la souris ; F5 : actualiser
  const nav = win.webContents.navigationHistory;
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.alt && input.key === "ArrowLeft" && nav.canGoBack()) (e.preventDefault(), nav.goBack());
    else if (input.alt && input.key === "ArrowRight" && nav.canGoForward()) (e.preventDefault(), nav.goForward());
    else if (input.key === "F5") (e.preventDefault(), win.webContents.reload());
  });
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward" && nav.canGoBack()) nav.goBack();
    if (cmd === "browser-forward" && nav.canGoForward()) nav.goForward();
  });
  win.once("ready-to-show", () => {
    splash.destroy();
    win.maximize();
    win.show();
  });
  win.on("closed", () => (win = null));
  // Page de connexion, ou directement l'espace de l'utilisateur s'il est déjà connecté
  await win.loadURL(`${origin}/connexion`);

  // Rappels J-7 … J+7 : au démarrage puis toutes les 6 heures tant que le logiciel est ouvert
  services.reminders();
  setInterval(() => services.reminders(), 6 * 3600_000);
}

/** « quittance-ZL-2026-000001.pdf », puis « … (2).pdf » si le fichier existe déjà. */
function uniquePath(dir, name) {
  const fs = require("node:fs");
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let file = path.join(dir, name);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${ext}`);
  return file;
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (e) => {
  if (!services || quitting) return;
  e.preventDefault();
  quitting = true;
  services.stop().finally(() => app.exit(0));
});
