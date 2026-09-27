/**
 * Tous les pays du monde : devise, fuseau horaire principal et taux de TVA standard connu.
 * À l'inscription, le pays choisi préremplit la devise, le fuseau et la taxe par défaut ;
 * tout reste modifiable ensuite. Un taux « null » veut dire : à renseigner par le client.
 * Données générées depuis la base des fuseaux (zone.tab) ; taux de TVA relevés en 2025-2026.
 */
export const COUNTRY_DATA: Record<string, [currency: string, timezone: string, vat: number | null]> = {
  AD: ["EUR", "Europe/Andorra", null],
  AE: ["AED", "Asia/Dubai", 5],
  AF: ["AFN", "Asia/Kabul", null],
  AG: ["XCD", "America/Antigua", null],
  AI: ["XCD", "America/Anguilla", null],
  AL: ["ALL", "Europe/Tirane", null],
  AM: ["AMD", "Asia/Yerevan", 20],
  AO: ["AOA", "Africa/Luanda", 14],
  AQ: ["USD", "Antarctica/McMurdo", null],
  AR: ["ARS", "America/Argentina/Buenos_Aires", 21],
  AS: ["USD", "Pacific/Pago_Pago", null],
  AT: ["EUR", "Europe/Vienna", 20],
  AU: ["AUD", "Australia/Sydney", 10],
  AW: ["AWG", "America/Aruba", null],
  AX: ["EUR", "Europe/Mariehamn", null],
  AZ: ["AZN", "Asia/Baku", 18],
  BA: ["BAM", "Europe/Sarajevo", null],
  BB: ["BBD", "America/Barbados", null],
  BD: ["BDT", "Asia/Dhaka", 15],
  BE: ["EUR", "Europe/Brussels", 21],
  BF: ["XOF", "Africa/Ouagadougou", 18],
  BG: ["EUR", "Europe/Sofia", 20],
  BH: ["BHD", "Asia/Bahrain", 10],
  BI: ["BIF", "Africa/Bujumbura", 18],
  BJ: ["XOF", "Africa/Porto-Novo", 18],
  BL: ["EUR", "America/St_Barthelemy", null],
  BM: ["BMD", "Atlantic/Bermuda", null],
  BN: ["BND", "Asia/Brunei", null],
  BO: ["BOB", "America/La_Paz", 13],
  BQ: ["USD", "America/Kralendijk", null],
  BR: ["BRL", "America/Sao_Paulo", 17],
  BS: ["BSD", "America/Nassau", null],
  BT: ["INR", "Asia/Thimphu", null],
  BV: ["NOK", "UTC", null],
  BW: ["BWP", "Africa/Gaborone", 14],
  BY: ["BYN", "Europe/Minsk", 20],
  BZ: ["BZD", "America/Belize", null],
  CA: ["CAD", "America/Toronto", 5],
  CC: ["AUD", "Indian/Cocos", null],
  CD: ["CDF", "Africa/Kinshasa", 16],
  CF: ["XAF", "Africa/Bangui", 19],
  CG: ["XAF", "Africa/Brazzaville", 18],
  CH: ["CHF", "Europe/Zurich", 8.1],
  CI: ["XOF", "Africa/Abidjan", 18],
  CK: ["NZD", "Pacific/Rarotonga", null],
  CL: ["CLP", "America/Santiago", 19],
  CM: ["XAF", "Africa/Douala", 19.25],
  CN: ["CNY", "Asia/Shanghai", 13],
  CO: ["COP", "America/Bogota", 19],
  CR: ["CRC", "America/Costa_Rica", 13],
  CU: ["CUP", "America/Havana", null],
  CV: ["CVE", "Atlantic/Cape_Verde", 15],
  CW: ["ANG", "America/Curacao", null],
  CX: ["AUD", "Indian/Christmas", null],
  CY: ["EUR", "Asia/Nicosia", 19],
  CZ: ["CZK", "Europe/Prague", 21],
  DE: ["EUR", "Europe/Berlin", 19],
  DJ: ["DJF", "Africa/Djibouti", 10],
  DK: ["DKK", "Europe/Copenhagen", 25],
  DM: ["XCD", "America/Dominica", null],
  DO: ["DOP", "America/Santo_Domingo", 18],
  DZ: ["DZD", "Africa/Algiers", 19],
  EC: ["USD", "America/Guayaquil", 15],
  EE: ["EUR", "Europe/Tallinn", 24],
  EG: ["EGP", "Africa/Cairo", 14],
  EH: ["MAD", "Africa/El_Aaiun", null],
  ER: ["ERN", "Africa/Asmara", null],
  ES: ["EUR", "Europe/Madrid", 21],
  ET: ["ETB", "Africa/Addis_Ababa", 15],
  FI: ["EUR", "Europe/Helsinki", 25.5],
  FJ: ["FJD", "Pacific/Fiji", null],
  FK: ["FKP", "Atlantic/Stanley", null],
  FM: ["USD", "Pacific/Pohnpei", null],
  FO: ["DKK", "Atlantic/Faroe", null],
  FR: ["EUR", "Europe/Paris", 20],
  GA: ["XAF", "Africa/Libreville", 18],
  GB: ["GBP", "Europe/London", 20],
  GD: ["XCD", "America/Grenada", null],
  GE: ["GEL", "Asia/Tbilisi", 18],
  GF: ["EUR", "America/Cayenne", null],
  GG: ["GBP", "Europe/Guernsey", null],
  GH: ["GHS", "Africa/Accra", 15],
  GI: ["GIP", "Europe/Gibraltar", null],
  GL: ["DKK", "America/Nuuk", null],
  GM: ["GMD", "Africa/Banjul", 15],
  GN: ["GNF", "Africa/Conakry", 18],
  GP: ["EUR", "America/Guadeloupe", null],
  GQ: ["XAF", "Africa/Malabo", 15],
  GR: ["EUR", "Europe/Athens", 24],
  GS: ["GBP", "Atlantic/South_Georgia", null],
  GT: ["GTQ", "America/Guatemala", 12],
  GU: ["USD", "Pacific/Guam", null],
  GW: ["XOF", "Africa/Bissau", 19],
  GY: ["GYD", "America/Guyana", null],
  HK: ["HKD", "Asia/Hong_Kong", 0],
  HM: ["AUD", "UTC", null],
  HN: ["HNL", "America/Tegucigalpa", 15],
  HR: ["EUR", "Europe/Zagreb", 25],
  HT: ["HTG", "America/Port-au-Prince", 10],
  HU: ["HUF", "Europe/Budapest", 27],
  ID: ["IDR", "Asia/Jakarta", 12],
  IE: ["EUR", "Europe/Dublin", 23],
  IL: ["ILS", "Asia/Jerusalem", 18],
  IM: ["GBP", "Europe/Isle_of_Man", null],
  IN: ["INR", "Asia/Kolkata", 18],
  IO: ["USD", "Indian/Chagos", null],
  IQ: ["IQD", "Asia/Baghdad", null],
  IR: ["IRR", "Asia/Tehran", null],
  IS: ["ISK", "Atlantic/Reykjavik", 24],
  IT: ["EUR", "Europe/Rome", 22],
  JE: ["GBP", "Europe/Jersey", null],
  JM: ["JMD", "America/Jamaica", 15],
  JO: ["JOD", "Asia/Amman", 16],
  JP: ["JPY", "Asia/Tokyo", 10],
  KE: ["KES", "Africa/Nairobi", 16],
  KG: ["KGS", "Asia/Bishkek", null],
  KH: ["KHR", "Asia/Phnom_Penh", null],
  KI: ["AUD", "Pacific/Tarawa", null],
  KM: ["KMF", "Indian/Comoro", 10],
  KN: ["XCD", "America/St_Kitts", null],
  KP: ["KPW", "Asia/Pyongyang", null],
  KR: ["KRW", "Asia/Seoul", 10],
  KW: ["KWD", "Asia/Kuwait", 0],
  KY: ["KYD", "America/Cayman", null],
  KZ: ["KZT", "Asia/Almaty", 12],
  LA: ["LAK", "Asia/Vientiane", null],
  LB: ["LBP", "Asia/Beirut", 11],
  LC: ["XCD", "America/St_Lucia", null],
  LI: ["CHF", "Europe/Vaduz", null],
  LK: ["LKR", "Asia/Colombo", 18],
  LR: ["LRD", "Africa/Monrovia", 10],
  LS: ["ZAR", "Africa/Maseru", 15],
  LT: ["EUR", "Europe/Vilnius", 21],
  LU: ["EUR", "Europe/Luxembourg", 17],
  LV: ["EUR", "Europe/Riga", 21],
  LY: ["LYD", "Africa/Tripoli", null],
  MA: ["MAD", "Africa/Casablanca", 20],
  MC: ["EUR", "Europe/Monaco", null],
  MD: ["MDL", "Europe/Chisinau", null],
  ME: ["EUR", "Europe/Podgorica", null],
  MF: ["EUR", "America/Marigot", null],
  MG: ["MGA", "Indian/Antananarivo", 20],
  MH: ["USD", "Pacific/Majuro", null],
  MK: ["MKD", "Europe/Skopje", null],
  ML: ["XOF", "Africa/Bamako", 18],
  MM: ["MMK", "Asia/Yangon", null],
  MN: ["MNT", "Asia/Ulaanbaatar", null],
  MO: ["MOP", "Asia/Macau", null],
  MP: ["USD", "Pacific/Saipan", null],
  MQ: ["EUR", "America/Martinique", null],
  MR: ["MRU", "Africa/Nouakchott", 16],
  MS: ["XCD", "America/Montserrat", null],
  MT: ["EUR", "Europe/Malta", 18],
  MU: ["MUR", "Indian/Mauritius", 15],
  MV: ["MVR", "Indian/Maldives", null],
  MW: ["MWK", "Africa/Blantyre", 16.5],
  MX: ["MXN", "America/Mexico_City", 16],
  MY: ["MYR", "Asia/Kuala_Lumpur", 8],
  MZ: ["MZN", "Africa/Maputo", 16],
  NA: ["ZAR", "Africa/Windhoek", 15],
  NC: ["XPF", "Pacific/Noumea", null],
  NE: ["XOF", "Africa/Niamey", 19],
  NF: ["AUD", "Pacific/Norfolk", null],
  NG: ["NGN", "Africa/Lagos", 7.5],
  NI: ["NIO", "America/Managua", 15],
  NL: ["EUR", "Europe/Amsterdam", 21],
  NO: ["NOK", "Europe/Oslo", 25],
  NP: ["NPR", "Asia/Kathmandu", 13],
  NR: ["AUD", "Pacific/Nauru", null],
  NU: ["NZD", "Pacific/Niue", null],
  NZ: ["NZD", "Pacific/Auckland", 15],
  OM: ["OMR", "Asia/Muscat", 5],
  PA: ["USD", "America/Panama", 7],
  PE: ["PEN", "America/Lima", 18],
  PF: ["XPF", "Pacific/Tahiti", null],
  PG: ["PGK", "Pacific/Port_Moresby", null],
  PH: ["PHP", "Asia/Manila", 12],
  PK: ["PKR", "Asia/Karachi", 18],
  PL: ["PLN", "Europe/Warsaw", 23],
  PM: ["EUR", "America/Miquelon", null],
  PN: ["NZD", "Pacific/Pitcairn", null],
  PR: ["USD", "America/Puerto_Rico", null],
  PS: ["ILS", "Asia/Gaza", null],
  PT: ["EUR", "Europe/Lisbon", 23],
  PW: ["USD", "Pacific/Palau", null],
  PY: ["PYG", "America/Asuncion", 10],
  QA: ["QAR", "Asia/Qatar", 0],
  RE: ["EUR", "Indian/Reunion", null],
  RO: ["RON", "Europe/Bucharest", 19],
  RS: ["RSD", "Europe/Belgrade", null],
  RU: ["RUB", "Europe/Moscow", 20],
  RW: ["RWF", "Africa/Kigali", 18],
  SA: ["SAR", "Asia/Riyadh", 15],
  SB: ["SBD", "Pacific/Guadalcanal", null],
  SC: ["SCR", "Indian/Mahe", 15],
  SD: ["SDG", "Africa/Khartoum", 17],
  SE: ["SEK", "Europe/Stockholm", 25],
  SG: ["SGD", "Asia/Singapore", 9],
  SH: ["SHP", "Atlantic/St_Helena", null],
  SI: ["EUR", "Europe/Ljubljana", 22],
  SJ: ["NOK", "Arctic/Longyearbyen", null],
  SK: ["EUR", "Europe/Bratislava", 23],
  SL: ["SLE", "Africa/Freetown", 15],
  SM: ["EUR", "Europe/San_Marino", null],
  SN: ["XOF", "Africa/Dakar", 18],
  SO: ["SOS", "Africa/Mogadishu", null],
  SR: ["SRD", "America/Paramaribo", null],
  SS: ["SSP", "Africa/Juba", null],
  ST: ["STN", "Africa/Sao_Tome", 15],
  SV: ["USD", "America/El_Salvador", 13],
  SX: ["ANG", "America/Lower_Princes", null],
  SY: ["SYP", "Asia/Damascus", null],
  SZ: ["SZL", "Africa/Mbabane", 15],
  TC: ["USD", "America/Grand_Turk", null],
  TD: ["XAF", "Africa/Ndjamena", 18],
  TF: ["EUR", "Indian/Kerguelen", null],
  TG: ["XOF", "Africa/Lome", 18],
  TH: ["THB", "Asia/Bangkok", 7],
  TJ: ["TJS", "Asia/Dushanbe", null],
  TK: ["NZD", "Pacific/Fakaofo", null],
  TL: ["USD", "Asia/Dili", null],
  TM: ["TMT", "Asia/Ashgabat", null],
  TN: ["TND", "Africa/Tunis", 19],
  TO: ["TOP", "Pacific/Tongatapu", null],
  TR: ["TRY", "Europe/Istanbul", 20],
  TT: ["TTD", "America/Port_of_Spain", null],
  TV: ["AUD", "Pacific/Funafuti", null],
  TW: ["TWD", "Asia/Taipei", 5],
  TZ: ["TZS", "Africa/Dar_es_Salaam", 18],
  UA: ["UAH", "Europe/Kyiv", 20],
  UG: ["UGX", "Africa/Kampala", 18],
  UM: ["USD", "Pacific/Midway", null],
  US: ["USD", "America/New_York", 0],
  UY: ["UYU", "America/Montevideo", 22],
  UZ: ["UZS", "Asia/Tashkent", 12],
  VA: ["EUR", "Europe/Vatican", null],
  VC: ["XCD", "America/St_Vincent", null],
  VE: ["VES", "America/Caracas", 16],
  VG: ["USD", "America/Tortola", null],
  VI: ["USD", "America/St_Thomas", null],
  VN: ["VND", "Asia/Ho_Chi_Minh", 10],
  VU: ["VUV", "Pacific/Efate", null],
  WF: ["XPF", "Pacific/Wallis", null],
  WS: ["WST", "Pacific/Apia", null],
  YE: ["YER", "Asia/Aden", null],
  YT: ["EUR", "Indian/Mayotte", null],
  ZA: ["ZAR", "Africa/Johannesburg", 15],
  ZM: ["ZMW", "Africa/Lusaka", 16],
  ZW: ["USD", "Africa/Harare", 15],
};

export type CountryInfo = { code: string; name: string; currency: string; timezone: string; vat: number | null };

const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });
const currencyNames = new Intl.DisplayNames(["fr"], { type: "currency" });

export function countryName(code: string | null | undefined) {
  if (!code) return "Inconnu";
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function getCountry(code: string | null | undefined): CountryInfo | null {
  const c = code?.toUpperCase() ?? "";
  const d = COUNTRY_DATA[c];
  return d ? { code: c, name: countryName(c), currency: d[0], timezone: d[1], vat: d[2] } : null;
}

const collator = new Intl.Collator("fr");

/** Pays d'Afrique de l'Ouest et centrale en tête (clients principaux), puis tous les autres par ordre alphabétique. */
const FIRST = ["TG", "BJ", "CI", "SN", "BF", "ML", "NE", "GN", "GH", "NG", "CM", "GA", "CG", "CD"];

export const ALL_COUNTRIES: CountryInfo[] = [
  ...FIRST.map((c) => getCountry(c)!),
  ...Object.keys(COUNTRY_DATA)
    .filter((c) => !FIRST.includes(c))
    .map((c) => getCountry(c)!)
    .sort((a, b) => collator.compare(a.name, b.name)),
];

export function currencyLabel(code: string) {
  const name = (() => {
    try {
      return currencyNames.of(code) ?? code;
    } catch {
      return code;
    }
  })();
  return code === "XOF" || code === "XAF" ? `${name} (FCFA)` : `${name.charAt(0).toUpperCase()}${name.slice(1)} (${code})`;
}

export const ALL_CURRENCIES = [...new Set(Object.values(COUNTRY_DATA).map((d) => d[0]))].sort((a, b) => {
  const rank = (c: string) => ["XOF", "XAF", "EUR", "USD"].indexOf(c);
  const ra = rank(a), rb = rank(b);
  if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  return collator.compare(currencyLabel(a), currencyLabel(b));
});

/** Fuseaux horaires proposés dans les paramètres. */
export const ALL_TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [...new Set(Object.values(COUNTRY_DATA).map((d) => d[1]))].sort();
  }
})();

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
