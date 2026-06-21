import type { Destination, EnrichedCountry, RoutingDecision } from "./types";

/**
 * Hardcoded European ISO2 codes as a fallback for when the restcountries
 * API doesn't return a region (network failure, missing API key, etc.).
 * This ensures European countries always route correctly regardless of
 * enrichment success.
 */
const EUROPEAN_ISO2 = new Set([
  "AL","AD","AT","BY","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR",
  "DE","GR","HU","IS","IE","IT","XK","LV","LI","LT","LU","MT","MD","MC",
  "ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE",
  "CH","UA","GB","VA",
]);

function isEuropean(enriched: EnrichedCountry): boolean {
  if (enriched.region === "Europe") return true;
  if (enriched.iso2 && EUROPEAN_ISO2.has(enriched.iso2)) return true;
  return false;
}

/**
 * Routing rules in priority order:
 *   1. monthly_orders > 1000 → "review"    (DISCORD_WEBHOOK_REVIEW)      any country
 *   2. European country      → "default"    (DISCORD_WEBHOOK_DEFAULT)     Europe channel
 *   3. Everything else       → "all_countries" (DISCORD_WEBHOOK_HIGH_VALUE)  others channel
 */
export function decideDestination(
  enriched: EnrichedCountry,
  monthlyOrders: number
): RoutingDecision {
  if (monthlyOrders > 1000) {
    return {
      destination: "review",
      reason: `monthly_orders (${monthlyOrders}) > 1000 — routed to high-volume channel`,
    };
  }

  if (isEuropean(enriched)) {
    return {
      destination: "default",
      reason: `European country (${enriched.name ?? enriched.iso2 ?? "unknown"}) — routed to Europe channel`,
    };
  }

  return {
    destination: "all_countries",
    reason: `Non-European country (${enriched.name ?? enriched.iso2 ?? "unknown"}) — routed to others channel`,
  };
}

export function destinationWebhook(
  destination: Destination,
  env: {
    DISCORD_WEBHOOK_DEFAULT: string;
    DISCORD_WEBHOOK_HIGH_VALUE: string;
    DISCORD_WEBHOOK_REVIEW: string;
  }
): string {
  switch (destination) {
    case "default":
      return env.DISCORD_WEBHOOK_DEFAULT;
    case "all_countries":
      return env.DISCORD_WEBHOOK_HIGH_VALUE || env.DISCORD_WEBHOOK_DEFAULT;
    case "review":
      return env.DISCORD_WEBHOOK_REVIEW || env.DISCORD_WEBHOOK_DEFAULT;
  }
}
