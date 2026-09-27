import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./errors";

/**
 * Stockage de fichiers. En local : disque (UPLOAD_DIR). En production, remplacer
 * put/get par un client S3 compatible sans changer les appelants.
 *
 * Deux espaces :
 * - public  `/files/{entreprise}/{nom}` : logos et photos produits, affichés sur les factures publiques ;
 * - privé   `/files/{entreprise}/p/{nom}` : justificatifs, servis seulement aux membres autorisés.
 */
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(ALLOWED).map(([t, e]) => [e, t]));
export const MAX_UPLOAD = 2 * 1024 * 1024;
/** Espace disque maximum par entreprise. */
export const COMPANY_QUOTA = Number(process.env.UPLOAD_QUOTA_MB ?? 200) * 1024 * 1024;

/** Signature réelle du fichier : le type annoncé par le navigateur ne suffit pas. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

/**
 * Enregistre un fichier. Les appelants vérifient les droits AVANT d'appeler cette fonction
 * (sinon n'importe quel membre pourrait remplir le disque).
 */
export async function putFile(companyId: string, file: File, opts: { imagesOnly?: boolean; private?: boolean } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(companyId)) throw new BusinessError("Entreprise invalide");
  if (file.size > MAX_UPLOAD) throw new BusinessError("Fichier trop volumineux (2 Mo maximum)");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new BusinessError("Format non autorisé (PNG, JPEG, WebP ou PDF)");
  if (opts.imagesOnly && ext === "pdf") throw new BusinessError("Image attendue (PNG, JPEG ou WebP)");
  const base = path.join(ROOT, companyId);
  if ((await dirSize(base)) + buf.length > COMPANY_QUOTA) {
    throw new BusinessError("Espace de stockage de l'entreprise plein. Supprimez des fichiers ou contactez le support.");
  }
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = opts.private ? path.join(base, "p") : base;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return opts.private ? `/files/${companyId}/p/${name}` : `/files/${companyId}/${name}`;
}

const PUBLIC_URL = /^\/files\/([0-9a-f-]{36})\/([0-9a-f]{32}\.(png|jpg|webp))$/;
const PRIVATE_URL = /^\/files\/([0-9a-f-]{36})\/p\/([0-9a-f]{32}\.(png|jpg|webp|pdf))$/;

/** Vrai si l'adresse désigne bien un fichier de cette entreprise enregistré par le serveur. */
export function isOwnFileUrl(url: string, companyId: string, kind: "public" | "private") {
  const m = (kind === "public" ? PUBLIC_URL : PRIVATE_URL).exec(url);
  return !!m && m[1] === companyId;
}

export async function readStoredFile(url: string) {
  const pub = PUBLIC_URL.exec(url);
  const priv = pub ? null : PRIVATE_URL.exec(url);
  const m = pub ?? priv;
  if (!m) return null;
  try {
    const data = await readFile(priv ? path.join(ROOT, m[1], "p", m[2]) : path.join(ROOT, m[1], m[2]));
    return { data, type: TYPE_BY_EXT[m[3]], companyId: m[1], private: !!priv };
  } catch {
    return null;
  }
}
