import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";

/**
 * Licences du logiciel de bureau (hors ligne).
 * Un code est signé avec la clé privée de ZE GROUP (Ed25519, gardée sur le serveur en ligne) et lié au
 * code d'installation d'un ordinateur : il ne peut être ni fabriqué ni réutilisé sur un autre poste.
 * Le logiciel ne contient que la clé publique, qui sert seulement à vérifier.
 */
const PUBLIC_KEY_X = "xyzKtBHL3NomKM_ZbnB_Lh9Fq90SJLCPVKEZK-QtZ2Y";
const VERSION = 1;
const EPOCH = Date.UTC(2024, 0, 1);
const DAY = 86_400_000;
export const LICENSE_PLANS = { 1: "BASIC", 2: "PRO", 3: "BUSINESS" } as const;
export type LicensePlan = (typeof LICENSE_PLANS)[keyof typeof LICENSE_PLANS];

// Base32 de Crockford : pas de I, L, O, U (évite les confusions à la saisie)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decode(text: string) {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Majuscules, sans espaces ni tirets, et lettres ambiguës corrigées (O→0, I/L→1). */
export function normalizeCode(text: string) {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

const group = (s: string, n: number) => s.match(new RegExp(`.{1,${n}}`, "g"))?.join("-") ?? s;

/** Code d'installation d'un poste : 8 caractères, affiché XXXX-XXXX. */
export function newInstallId() {
  return group(encode(randomBytes(5)), 4);
}

function message(installId: string, expDays: number, plan: number) {
  return Buffer.from(`ZEG${VERSION}|${normalizeCode(installId)}|${expDays}|${plan}`);
}

export type License = { plan: LicensePlan; expiresAt: Date | null };

/** Vérifie un code pour ce poste. Renvoie null s'il est faux, abîmé ou prévu pour un autre ordinateur. */
export function verifyLicense(code: string, installId: string, publicKeyX = PUBLIC_KEY_X): License | null {
  const raw = decode(normalizeCode(code));
  if (!raw || raw.length < 68 || raw[0] !== VERSION) return null;
  const expDays = raw.readUInt16BE(1);
  const plan = raw[3] as keyof typeof LICENSE_PLANS;
  if (!LICENSE_PLANS[plan]) return null;
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeyX }, format: "jwk" });
  if (!verify(null, message(installId, expDays, plan), key, raw.subarray(4, 68))) return null;
  return { plan: LICENSE_PLANS[plan], expiresAt: expDays === 0 ? null : new Date(EPOCH + expDays * DAY) };
}

/** Fabrique un code (serveur en ligne uniquement : nécessite LICENSE_PRIVATE_KEY). expiresAt null = à vie. */
export function createLicense(privateKeyD: string, installId: string, plan: LicensePlan, expiresAt: Date | null) {
  const planCode = Number(Object.entries(LICENSE_PLANS).find(([, p]) => p === plan)?.[0]);
  if (!planCode) throw new Error("Formule inconnue");
  const id = normalizeCode(installId);
  if (!/^[0-9A-Z]{8}$/.test(id)) throw new Error("Code d'installation invalide (8 caractères, ex. 7K2P-QX9M)");
  const expDays = expiresAt ? Math.ceil((expiresAt.getTime() - EPOCH) / DAY) : 0;
  if (expDays < 0 || expDays > 65535) throw new Error("Date de fin invalide");
  // Clé privée brute (32 octets, base64url) enveloppée en PKCS#8
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(privateKeyD, "base64url")]), format: "der", type: "pkcs8" });
  const head = Buffer.alloc(4);
  head[0] = VERSION;
  head.writeUInt16BE(expDays, 1);
  head[3] = planCode;
  const sig = sign(null, message(id, expDays, planCode), key);
  return group(encode(Buffer.concat([head, sig])), 5);
}

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

export const isDesktop = () => process.env.ZE_EDITION === "desktop";
