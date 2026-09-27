/** Motif « contient » pour ILIKE : % et _ saisis par l'utilisateur sont cherchés tels quels, pas comme jokers. */
export function contains(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
