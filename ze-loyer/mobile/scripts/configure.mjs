// Écrit l'adresse du serveur ZE LOYER dans www/config.json (lue par capacitor.config.ts) et génère les pages locales de www/.
// Usage : ZE_LOYER_URL=https://app.zeloyer.tg npm run configure
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const raw = (process.env.ZE_LOYER_URL ?? "").trim().replace(/\/+$/, "");
let serverUrl = null;
if (raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    console.error(`ZE_LOYER_URL invalide : « ${raw} » (exemple : https://app.zeloyer.tg)`);
    process.exit(1);
  }
  // Test local uniquement (émulateur → http://10.0.2.2:3000, serveur en mode dev) : ZE_LOYER_ALLOW_HTTP=1
  if (u.protocol !== "https:" && !(process.env.ZE_LOYER_ALLOW_HTTP === "1" && u.protocol === "http:")) {
    console.error("ZE_LOYER_URL doit commencer par https:// (Android refuse les connexions non sécurisées, et la connexion au compte l'exige).");
    process.exit(1);
  }
  serverUrl = u.origin;
}
const allowHttp = !!serverUrl && serverUrl.startsWith("http:");
if (allowHttp) console.warn("⚠ Connexion NON sécurisée (http) autorisée : version de TEST uniquement, ne pas distribuer.");
// www/ est entièrement généré : pages locales (écran « pas encore configurée » et écran « Pas de connexion »)
// avec le style et l'adresse du serveur intégrés (aucun fichier annexe à charger hors connexion).
const www = new URL("../www/", import.meta.url);
mkdirSync(www, { recursive: true });
const css = readFileSync(new URL("./templates/app.css", import.meta.url), "utf8");
for (const page of ["index.html", "offline.html"]) {
  const html = readFileSync(new URL(`./templates/${page}`, import.meta.url), "utf8")
    .replace("/*CSS*/", css)
    .replace("__SERVER_URL__", serverUrl ?? "");
  writeFileSync(new URL(page, www), html);
}
writeFileSync(new URL("config.json", www), JSON.stringify({ serverUrl, allowHttp }, null, 2) + "\n");
console.log(serverUrl ? `Serveur ZE LOYER : ${serverUrl}` : "⚠ Aucune adresse de serveur (ZE_LOYER_URL) : l'application affichera « pas encore configurée ».");
