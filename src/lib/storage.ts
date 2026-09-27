import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./errors";

/**
 * Stockage de fichiers. En local : disque (UPLOAD_DIR). En production, remplacer
 * put/get par un client S3 compatible sans changer les appelants.
 */
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_UPLOAD = 2 * 1024 * 1024;

export async function putFile(companyId: string, file: File, opts: { imagesOnly?: boolean } = {}) {
  const ext = ALLOWED[file.type];
  if (opts.imagesOnly && ext === "pdf") throw new BusinessError("Image attendue (PNG, JPEG ou WebP)");
  if (!ext) throw new BusinessError("Format non autorisé (PNG, JPEG, WebP ou PDF)");
  if (file.size > MAX_UPLOAD) throw new BusinessError("Fichier trop volumineux (2 Mo maximum)");
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = path.join(ROOT, companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return `/files/${companyId}/${name}`;
}

const SAFE = /^\/files\/([0-9a-f-]{36})\/([0-9a-f]{32}\.(png|jpg|webp|pdf))$/;

export async function readStoredFile(url: string) {
  const m = SAFE.exec(url);
  if (!m) return null;
  try {
    const data = await readFile(path.join(ROOT, m[1], m[2]));
    const type = Object.entries(ALLOWED).find(([, e]) => e === m[3])![0];
    return { data, type };
  } catch {
    return null;
  }
}
