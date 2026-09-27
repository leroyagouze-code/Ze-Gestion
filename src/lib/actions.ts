import { ZodError } from "zod";
import { BusinessError } from "./errors";
import { ForbiddenError } from "./permissions";
import { zodMessage } from "./zod";

export type ActionState = { error?: string; ok?: string; data?: unknown } | undefined;

/** Transforme les erreurs métier/validation en message lisible pour le formulaire. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return { ok: ok ?? "Enregistré" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export function errorMessage(e: unknown) {
  if (e instanceof ZodError) return zodMessage(e);
  if (e instanceof BusinessError || e instanceof ForbiddenError) return e.message;
  if (e instanceof Error && e.name === "AuthError") return e.message;
  console.error(e);
  return "Une erreur est survenue. Réessayez.";
}
