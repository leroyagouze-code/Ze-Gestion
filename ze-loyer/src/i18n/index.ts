/*
 * Internationalisation. Seul le français est rempli pour la V1.
 * Pour ajouter une langue (Éwé, Kabyè, Anglais…) : créer le dictionnaire, puis passer `ready: true`.
 * Les clés manquantes retombent sur le français.
 */
import { fr, type Messages } from "./fr";

export const LOCALES = [
  { code: "fr", label: "Français", ready: true },
  { code: "en", label: "English", ready: false },
  { code: "ee", label: "Eʋegbe (Éwé)", ready: false },
  { code: "kbp", label: "Kabɩyɛ (Kabyè)", ready: false },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export type MessageKey = keyof Messages;

const dictionaries: Partial<Record<Locale, Partial<Messages>>> = { fr };

export function getMessages(locale: string = "fr") {
  const dict = dictionaries[locale as Locale] ?? {};
  return (key: MessageKey) => dict[key] ?? fr[key];
}

export const t = getMessages("fr");
