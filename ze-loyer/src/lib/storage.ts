import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./errors";

/*
 * Stockage des fichiers (contrats, preuves de paiement).
 * Local (UPLOAD_DIR) pour le MVP ; remplacer ces deux fonctions pour brancher S3 / R2 en production.
 * Les fichiers ne sont jamais servis directement : ils passent par /api/documents/[id] qui vérifie l'accès.
 */
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function storeFile(orgId: string, file: File) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new BusinessError("Format non accepté : PDF, JPG, PNG ou WEBP uniquement.");
  if (file.size > MAX_FILE_SIZE) throw new BusinessError("Fichier trop lourd (5 Mo maximum).");
  if (!/^[0-9a-f-]{36}$/.test(orgId)) throw new BusinessError("Organisation invalide");
  const key = `${orgId}/${randomBytes(16).toString("hex")}.${ext}`;
  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return { key, mimeType: file.type, size: file.size };
}

export async function readStoredFile(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
