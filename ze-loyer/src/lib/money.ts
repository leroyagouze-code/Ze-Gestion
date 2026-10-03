/** « 75 000 F » — espaces fines insécables pour éviter les coupures */
export function formatMoney(v: number, suffix = "F") {
  const s = Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${s} ${suffix}`;
}

export function formatFCFA(v: number) {
  return formatMoney(v, "FCFA");
}

/** Version PDF (les polices standard ne gèrent pas l'espace fine) */
export function formatMoneyPlain(v: number, suffix = "FCFA") {
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${suffix}`;
}
