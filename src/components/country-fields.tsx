"use client";

import { useState } from "react";

type Option = { value: string; label: string };

/**
 * Pays, devise (et fuseau horaire) : choisir le pays propose aussitôt sa devise et son fuseau ;
 * le client peut toujours les changer à la main.
 */
export function CountryFields({
  countries,
  currencies,
  timezones,
  countryInfo,
  defaults,
}: {
  countries: Option[];
  currencies: Option[];
  timezones?: Option[];
  countryInfo: Record<string, [currency: string, timezone: string]>;
  defaults: { country: string; currency: string; timezone?: string };
}) {
  const [country, setCountry] = useState(defaults.country);
  const [currency, setCurrency] = useState(defaults.currency);
  const [timezone, setTimezone] = useState(defaults.timezone ?? "");
  return (
    <>
      <div>
        <label className="label" htmlFor="country">Pays</label>
        <select
          id="country"
          name="country"
          className="input"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            const info = countryInfo[e.target.value];
            if (info) {
              setCurrency(info[0]);
              setTimezone(info[1]);
            }
          }}
        >
          {countries.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="currency">Devise</label>
        <select id="currency" name="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {timezones ? (
        <div>
          <label className="label" htmlFor="timezone">Fuseau horaire</label>
          <select id="timezone" name="timezone" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezones.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="timezone" value={timezone} />
      )}
    </>
  );
}
