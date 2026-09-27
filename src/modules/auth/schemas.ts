import { z } from "zod";
import { TRADE_KEYS, type TradeKey } from "@/lib/trades";

const optional = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : null));

export const signupSchema = z.object({
  businessType: z.enum(TRADE_KEYS as [TradeKey, ...TradeKey[]]).default("general"),
  companyName: z.string().trim().min(2, "Nom de l'entreprise requis").max(120),
  ownerName: z.string().trim().min(2, "Nom du responsable requis").max(120),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z.string().min(8, "8 caractères minimum").max(200),
  phone: optional,
  whatsapp: optional,
  address: optional,
  city: optional,
  country: z.string().trim().length(2).default("TG"),
  currency: z.string().trim().length(3).default("XOF"),
  taxId: optional,
  billingAddress: optional,
  extraInfo: optional,
});
export type SignupInput = z.input<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis").max(200, "Mot de passe trop long"),
});
