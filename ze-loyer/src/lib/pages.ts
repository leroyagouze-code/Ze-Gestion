import { notFound } from "next/navigation";
import { NotFoundError } from "./errors";

/** Dans une page : un élément introuvable ou hors périmètre → page 404 (sans révéler s'il existe). */
export async function found<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
