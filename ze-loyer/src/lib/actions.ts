import { ZodError } from "zod";
import { BusinessError } from "./errors";
import { zodMessage } from "./zod";

export type ActionState = { error?: string; ok?: string; data?: Record<string, unknown> } | undefined;

/** Transforme les erreurs de validation / métier en message simple pour le formulaire. */
export function errorMessage(e: unknown) {
  if (e instanceof ZodError) return zodMessage(e);
  if (e instanceof BusinessError) return e.message;
  console.error(e);
  return "Une erreur est survenue. Réessayez.";
}

export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return { ok: ok ?? "Enregistré" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
