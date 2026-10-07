/*
 * Formules commerciales (modèle uniquement : aucun paiement d'abonnement n'est codé en V1).
 * Les limites serviront plus tard à proposer une montée en gamme ; elles ne bloquent rien aujourd'hui.
 */
export const PLANS = [
  { code: "FREE", label: "Gratuit", maxUnits: 3, audience: "Découverte" },
  { code: "STARTER", label: "Starter", maxUnits: 10, audience: "Petit propriétaire (2 à 10 logements)" },
  { code: "PRO", label: "Pro", maxUnits: 50, audience: "Propriétaire moyen (10 à 50 logements)" },
  { code: "AGENCE", label: "Agence", maxUnits: null, audience: "Agence (50 à plusieurs centaines de logements)" },
] as const;

export type PlanCode = (typeof PLANS)[number]["code"];
