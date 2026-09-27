import { ALL_COUNTRIES, ALL_CURRENCIES, ALL_TIMEZONES, currencyLabel } from "./countries";

/** Listes pour les formulaires : tous les pays, toutes les devises, tous les fuseaux. */
export const COUNTRIES = ALL_COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
export const CURRENCIES = ALL_CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c) }));
export const TIMEZONES = ALL_TIMEZONES.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));

/** Devise et fuseau de chaque pays, pour préremplir le formulaire côté navigateur. */
export const COUNTRY_INFO: Record<string, [currency: string, timezone: string]> = Object.fromEntries(ALL_COUNTRIES.map((c) => [c.code, [c.currency, c.timezone]]));
