import type { EnrichedCountry, Env, MatchMethod } from "./types";
import { normalizeCountryLocal } from "./countryNormalize";
import { fetchWithRetry } from "./http";

const REST_COUNTRIES_BASE = "https://api.restcountries.com/countries/v5";
const FIELDS = "response_fields=names.common,codes.alpha_2,region,subregion,currencies,calling_codes";

interface RestCountryV5Record {
  names: { common: string };
  codes: { alpha_2: string };
  region: string;
  subregion?: string;
  currencies?: Array<{ code: string; name: string; symbol: string }>;
  calling_codes?: string[];
}

interface RestCountriesV5Response {
  data?: { objects?: RestCountryV5Record[] };
  objects?: RestCountryV5Record[];
}

const LOCAL_COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  EG: "Egypt",
  SA: "Saudi Arabia",
  US: "United States",
  GB: "United Kingdom",
  IN: "India",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  JP: "Japan",
  CN: "China",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
  JO: "Jordan",
  LB: "Lebanon",
  TR: "Turkey",
  PK: "Pakistan",
  NG: "Nigeria",
  ZA: "South Africa",
};

function buildEmpty(method: MatchMethod): EnrichedCountry {
  return {
    iso2: null,
    name: null,
    region: null,
    subregion: null,
    currency: null,
    calling_code: null,
    match_method: method,
  };
}

function buildLocalFallback(iso2: string, method: MatchMethod): EnrichedCountry {
  return {
    iso2,
    name: LOCAL_COUNTRY_NAMES[iso2] ?? iso2,
    region: null,
    subregion: null,
    currency: null,
    calling_code: null,
    match_method: method,
  };
}

function toEnriched(record: RestCountryV5Record, method: MatchMethod): EnrichedCountry {
  const currencyCode = record.currencies?.[0]?.code ?? null;
  const callingCode = record.calling_codes?.[0] ?? null;

  return {
    iso2: record.codes.alpha_2,
    name: record.names.common,
    region: record.region,
    subregion: record.subregion ?? null,
    currency: currencyCode,
    calling_code: callingCode,
    match_method: method,
  };
}

function extractFirstRecord(response: RestCountriesV5Response): RestCountryV5Record | null {
  const objects = response.data?.objects ?? response.objects;
  if (!Array.isArray(objects) || objects.length === 0) return null;
  return objects[0] ?? null;
}

async function lookupByAlpha2(iso2: string, env: Env): Promise<RestCountryV5Record | null> {
  const headers: HeadersInit = {};
  if (env.RESTCOUNTRIES_API_KEY) {
    headers.Authorization = `Bearer ${env.RESTCOUNTRIES_API_KEY}`;
  }

  const res = await fetchWithRetry(
    `${REST_COUNTRIES_BASE}/codes.alpha_2/${encodeURIComponent(iso2)}?${FIELDS}`,
    { method: "GET", headers },
    { timeoutMs: 4000, retries: 2 }
  );
  console.log("[enrich] alpha2 status", iso2, res.status);
  if (!res.ok) return null;
  const body = (await res.json()) as RestCountriesV5Response;
  console.log("[enrich] alpha2 keys", iso2, Object.keys(body as object));
  return extractFirstRecord(body);
}

async function lookupByName(name: string, env: Env): Promise<RestCountryV5Record | null> {
  const headers: HeadersInit = {};
  if (env.RESTCOUNTRIES_API_KEY) {
    headers.Authorization = `Bearer ${env.RESTCOUNTRIES_API_KEY}`;
  }

  const res = await fetchWithRetry(
    `${REST_COUNTRIES_BASE}/name?q=${encodeURIComponent(name)}&${FIELDS}`,
    { method: "GET", headers },
    { timeoutMs: 4000, retries: 1 }
  );
  console.log("[enrich] name status", name, res.status);
  if (!res.ok) return null;
  const body = (await res.json()) as RestCountriesV5Response;
  console.log("[enrich] name keys", name, Object.keys(body as object));
  return extractFirstRecord(body);
}

/**
 * Resolution order:
 *   1. Local alias table (fast, free, no network) — covers known dirty
 *      variants like "UAE" / "U.A.E." / "ae".
 *   2. Phone calling-code prefix, only used when country was missing
 *      entirely.
 *   3. restcountries.com lookup by the ISO2 resolved in step 1/2, to pull
 *      region / currency / calling code.
 *   4. If we still have nothing but do have a raw string, a fuzzy
 *      restcountries.com name search as a last resort.
 *   5. If all of that fails, return an "unresolved" record rather than
 *      throwing — a bad country field should never crash the webhook.
 */
export async function enrichCountry(
  countryRaw: string | null,
  phone: string | null,
  env: Env
): Promise<EnrichedCountry> {
  console.log("[enrich] restcountries key length", env.RESTCOUNTRIES_API_KEY?.length ?? 0);
  const local = normalizeCountryLocal(countryRaw, phone);

  if (local.iso2) {
    try {
      const record = await lookupByAlpha2(local.iso2, env);
      console.log("[enrich] alpha2 lookup", local.iso2, record ? "hit" : "miss");
      if (record) return toEnriched(record, local.method);
    } catch {
      // API trouble — fall through to a name search (if we have raw text)
      // or return unresolved below. Never throw out of here.
    }

    return buildLocalFallback(local.iso2, local.method);
  }

  if (countryRaw) {
    try {
      const record = await lookupByName(countryRaw, env);
      console.log("[enrich] name lookup", countryRaw, record ? "hit" : "miss");
      if (record) return toEnriched(record, "api_lookup");
    } catch {
      // If the name lookup fails, keep the request alive and fall through.
    }

    if (!phone) {
      return buildEmpty("unresolved");
    }
  }

  if (phone && !local.iso2) {
    try {
      const record = await lookupByPhoneHint(phone);
      if (record) return toEnriched(record, "phone_inference");
    } catch {
      // Already in fallback path — nothing left to try.
    }
  }

  return buildEmpty("unresolved");
}

async function lookupByPhoneHint(phone: string): Promise<RestCountryRecord | null> {
  const digits = phone.replace(/[^\d+]/g, "");
  const knownHints = ["+971", "+20", "+966", "+974", "+965", "+973", "+968", "+962", "+961", "+90", "+44", "+91", "+49", "+33", "+86", "+81", "+61", "+27", "+234", "+92"];

  const prefix = knownHints.find((hint) => digits.startsWith(hint));
  if (!prefix) return null;

  const codeToIso2: Record<string, string> = {
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
  };

  return lookupByAlpha2(codeToIso2[prefix]);
}
