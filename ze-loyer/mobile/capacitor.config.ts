import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * L'application Android ouvre le site ZE LOYER hébergé sur votre serveur (adresse HTTPS).
 * L'adresse vient de ZE_LOYER_URL (voir scripts/configure.mjs, qui l'écrit dans www/config.json).
 * Sans adresse, l'application affiche un écran expliquant qu'elle n'est pas encore configurée.
 */
const { serverUrl, allowHttp = false } = JSON.parse(readFileSync(resolve(process.cwd(), "www/config.json"), "utf8")) as {
  serverUrl: string | null;
  allowHttp?: boolean;
};

const config: CapacitorConfig = {
  appId: "com.zegroup.zeloyer",
  appName: "ZE LOYER",
  webDir: "www",
  backgroundColor: "#0f5f3e",
  // Permet au site de savoir qu'il est ouvert dans l'application Android
  appendUserAgent: "ZeLoyerAndroid",
  server: serverUrl
    ? {
        url: `${serverUrl}/connexion`,
        // Page locale affichée si le site ne répond pas (pas d'internet, serveur arrêté)
        errorPath: "offline.html",
        cleartext: allowHttp,
      }
    : undefined,
  android: {
    allowMixedContent: allowHttp,
    // Débogage de la WebView : uniquement dans la version de test (http local), jamais dans l'APK distribué
    webContentsDebuggingEnabled: allowHttp,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0f5f3e",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0f5f3e",
      overlaysWebView: false,
    },
  },
};

export default config;
