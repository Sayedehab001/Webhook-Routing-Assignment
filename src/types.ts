export interface Env {
  APPLICATIONS_KV: KVNamespace;
  DISCORD_WEBHOOK_DEFAULT: string;
  DISCORD_WEBHOOK_HIGH_VALUE: string;
  DISCORD_WEBHOOK_REVIEW: string;
  RESTCOUNTRIES_API_KEY?: string;
  JINA_API_KEY?: string;
  WEBHOOK_SHARED_SECRET?: string;
}

export interface RawApplicationPayload {
  application_id?: unknown;
  business_name?: unknown;
  contact_email?: unknown;
  body?: unknown;
  country?: unknown;
  region?: unknown;
  phone?: unknown;
  monthly_orders?: unknown;
  submitted_at?: unknown;
}

export interface ValidatedApplication {
  application_id: string;
  business_name: string;
  contact_email: string;
  body_text: string | null;
  country_raw: string | null;
  region_hint: string | null;
  phone: string | null;
  monthly_orders: number;
  submitted_at: string;
}

export type MatchMethod = "alias" | "phone_inference" | "api_lookup" | "unresolved";

export interface EnrichedCountry {
  iso2: string | null;
  name: string | null;
  region: string | null;
  subregion: string | null;
  currency: string | null;
  calling_code: string | null;
  match_method: MatchMethod;
}

export type Destination = "default" | "all_countries" | "review";

export interface RoutingDecision {
  destination: Destination;
  reason: string;
}
