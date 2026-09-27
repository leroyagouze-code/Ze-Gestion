// ZE Gestion, logiciel de bureau : lance les services locaux puis ouvre l'application dans une fenêtre.
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
  const splash = new BrowserWindow({ width: 420, height: 260, frame: false, resizable: false, center: true, icon, backgroundColor: "#0f766e" });
  splash.loadFile(path.join(__dirname, "splash.html"));
  try {
    services = await startServices({ resourcesDir, dataDir: app.getPath("userData"), pgBin, log: (m) => console.log(m) });
  } catch (e) {
    splash.destroy();
    dialog.showErrorBox(
      "ZE Gestion n'a pas pu démarrer",
      `${e.message}\n\nJournal : ${path.join(app.getPath("userData"), "logs", "app.log")}\nEnvoyez ce message à ZE GROUP.`,
    );
    app.exit(1);
    return;
  }

  const origin = services.url;
  const isLocal = (url) => url === origin || url.startsWith(origin + "/");
  // Caméra (scan des codes-barres à la caisse) autorisée pour l'application seulement
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(isLocal(wc.getURL()) && ["media", "clipboard-sanitized-write"].includes(permission)));

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "ZE Gestion",
    icon,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Factures et tickets s'ouvrent dans une fenêtre du logiciel ; WhatsApp et liens externes dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: "allow", overrideBrowserWindowOptions: { width: 900, height: 1000, icon, autoHideMenuBar: true } };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isLocal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.once("ready-to-show", () => {
    splash.destroy();
    win.maximize();
    win.show();
  });
  win.on("closed", () => (win = null));
  await win.loadURL(origin);
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (e) => {
  if (!services || quitting) return;
  e.preventDefault();
  quitting = true;
  services.stop().finally(() => app.exit(0));
});
