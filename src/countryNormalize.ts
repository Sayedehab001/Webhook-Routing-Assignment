import type { MatchMethod } from "./types";

export interface NormalizationResult {
  iso2: string | null;
  method: MatchMethod;
}

/**
 * Hand-built aliases for the dirty country strings we actually expect from
 * the intake forms (UAE / U.A.E. / ae / United Arab Emirates / ...). This
 * is NOT meant to be an exhaustive gazetteer — it's the fast, free, no-
 * network path for the common cases. Anything that doesn't match here
 * falls through to a live restcountries.com lookup in enrich.ts.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  // United Arab Emirates
  UAE: "AE",
  AE: "AE",
  EMIRATES: "AE",
  "UNITED ARAB EMIRATES": "AE",

  // Egypt
  EG: "EG",
  EGYPT: "EG",
  "ARAB REPUBLIC OF EGYPT": "EG",

  // Saudi Arabia
  SA: "SA",
  KSA: "SA",
  "SAUDI ARABIA": "SA",

  // United States
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",

  // United Kingdom
  UK: "GB",
  GB: "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",

  // Other common ones seen in B2B intake forms
  INDIA: "IN",
  IN: "IN",
  GERMANY: "DE",
  DE: "DE",
  FRANCE: "FR",
  FR: "FR",
  CANADA: "CA",
  CA: "CA",
  AUSTRALIA: "AU",
  AU: "AU",
  JAPAN: "JP",
  JP: "JP",
  CHINA: "CN",
  CN: "CN",
  QATAR: "QA",
  QA: "QA",
  KUWAIT: "KW",
  KW: "KW",
  BAHRAIN: "BH",
  BH: "BH",
  OMAN: "OM",
  OM: "OM",
  JORDAN: "JO",
  JO: "JO",
  LEBANON: "LB",
  LB: "LB",
  TURKEY: "TR",
  TR: "TR",
  PAKISTAN: "PK",
  PK: "PK",
  NIGERIA: "NG",
  NG: "NG",
  "SOUTH AFRICA": "ZA",
  ZA: "ZA",
};

/**
 * Calling codes are NOT 1:1 with countries (+1 alone covers the US, Canada
 * and a dozen Caribbean nations), so this is only consulted as a last
 * resort when the country field is missing entirely — and it's a short,
 * high-confidence list rather than an attempt at the full ITU table.
 */
const CALLING_CODE_HINTS: Record<string, string> = {
  "+971": "AE",
  "+20": "EG",
  "+966": "SA",
  "+974": "QA",
  "+965": "KW",
  "+973": "BH",
  "+968": "OM",
  "+962": "JO",
  "+961": "LB",
  "+90": "TR",
  "+44": "GB",
  "+91": "IN",
  "+49": "DE",
  "+33": "FR",
  "+86": "CN",
  "+81": "JP",
  "+61": "AU",
  "+27": "ZA",
  "+234": "NG",
  "+92": "PK",
  // +1 is deliberately omitted — too ambiguous (US/Canada/Caribbean) to
  // trust on its own.
};

function normalizeKey(input: string): string {
  return input.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
}

/** Resolve a country to an ISO2 code using local data only — no network calls. */
export function normalizeCountryLocal(
  countryRaw: string | null,
  phone: string | null
): NormalizationResult {
  if (countryRaw) {
    const key = normalizeKey(countryRaw);
    if (COUNTRY_ALIASES[key]) {
      return { iso2: COUNTRY_ALIASES[key], method: "alias" };
    }
    // Looks like it might already be an ISO2 code we just haven't aliased.
    if (/^[A-Z]{2}$/.test(key)) {
      return { iso2: key, method: "alias" };
    }
  }

  if (phone) {
    const digits = phone.replace(/[^\d+]/g, "");
    const prefixesLongestFirst = Object.keys(CALLING_CODE_HINTS).sort((a, b) => b.length - a.length);
    for (const prefix of prefixesLongestFirst) {
      if (digits.startsWith(prefix)) {
        return { iso2: CALLING_CODE_HINTS[prefix], method: "phone_inference" };
      }
    }
  }

  return { iso2: null, method: "unresolved" };
}
