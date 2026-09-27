/** Démarrage du serveur Next.js : sur le logiciel Windows, signale l'installation au serveur en ligne. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ZE_EDITION === "desktop") {
    const { startInstallReporting } = await import("./modules/installs/report");
    startInstallReporting();
  }
}
