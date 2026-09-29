"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage } from "@/lib/actions";
import { requireContext } from "@/lib/auth/server";
import { convertQuoteToInvoice, createQuote, setQuoteStatus, updateQuote, type QuoteInput } from "@/modules/quotes/service";

export async function saveQuoteAction(id: string | null, input: QuoteInput) {
  const ctx = await requireContext();
  try {
    const saved = id ? await updateQuote(ctx, id, input) : await createQuote(ctx, input);
    revalidatePath(`/quotes/${saved}`);
    return { ok: true as const, id: saved };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

/** Boutons de suivi : l'erreur éventuelle revient dans l'URL (?erreur=) pour s'afficher sur la fiche. */
export async function quoteStatusAction(id: string, to: "sent" | "accepted" | "refused" | "reopen") {
  const ctx = await requireContext();
  let error: string | null = null;
  try {
    await setQuoteStatus(ctx, id, to);
  } catch (e) {
    error = errorMessage(e);
  }
  revalidatePath(`/quotes/${id}`);
  redirect(error ? `/quotes/${id}?erreur=${encodeURIComponent(error)}` : `/quotes/${id}`);
}

export async function convertQuoteAction(id: string) {
  const ctx = await requireContext();
  let invoiceId: string | null = null;
  let error: string | null = null;
  try {
    invoiceId = await convertQuoteToInvoice(ctx, id);
  } catch (e) {
    error = errorMessage(e);
  }
  revalidatePath(`/quotes/${id}`);
  redirect(invoiceId ? `/invoices/${invoiceId}` : `/quotes/${id}?erreur=${encodeURIComponent(error ?? "")}`);
}
