import type { Destination, EnrichedCountry, Env, ValidatedApplication } from "./types";
import { fetchWithRetry } from "./http";
import { destinationWebhook } from "./route";

const DESTINATION_COLOR: Record<Destination, number> = {
  default: 0x5865f2, // Discord blurple
  all_countries: 0xf1c40f, // gold
  review: 0xe74c3c, // red
};

export interface NotifyResult {
  delivered: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

export async function notifyDiscord(
  env: Env,
  app: ValidatedApplication,
  enriched: EnrichedCountry,
  destination: Destination,
  reason: string,
  deliveryEnabled: boolean,
  duplicateStatus: "duplicate" | "fresh"
): Promise<NotifyResult> {
  const webhookUrl = destinationWebhook(destination, env);
  if (!webhookUrl) {
    return { delivered: false, error: "no webhook URL configured for this destination" };
  }

  if (!deliveryEnabled) {
    return { delivered: false, skipped: true, error: "delivery disabled from dashboard" };
  }

  const countryLabel = enriched.name
    ? `${enriched.name} (${enriched.iso2})`
    : app.country_raw
      ? `${app.country_raw} (unresolved)`
      : "not provided";

  const payload = {
    username: "Partner Applications",
    embeds: [
      {
        title: `New partner application — ${app.business_name}`,
        description: reason,
        color: DESTINATION_COLOR[destination],
        fields: [
          { name: "Destination", value: destination, inline: true },
          { name: "Duplicate", value: duplicateStatus, inline: true },
          { name: "Business name", value: `${countryLabel} - ${app.business_name}`, inline: false },
          { name: "Country", value: countryLabel, inline: true },
          { name: "Region", value: enriched.region ?? "—", inline: true },
          { name: "Currency", value: enriched.currency ?? "—", inline: true },
          { name: "Calling code", value: enriched.calling_code ?? "—", inline: true },
          { name: "Monthly orders", value: String(app.monthly_orders), inline: true },
          { name: "Contact email", value: app.contact_email, inline: true },
          { name: "Body", value: app.body_text ?? "—", inline: false },
          { name: "Country match method", value: enriched.match_method, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetchWithRetry(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 4000, retries: 2 }
    );

    if (res.ok) {
      return { delivered: true, status: res.status };
    }

    await queueFailedNotification(env, app.contact_email, payload, `status ${res.status}`);
    return { delivered: false, status: res.status, error: `webhook returned ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await queueFailedNotification(env, app.contact_email, payload, message);
    return { delivered: false, error: message };
  }
}

async function queueFailedNotification(
  env: Env,
  contactEmail: string,
  payload: unknown,
  error: string
): Promise<void> {
  try {
    await env.APPLICATIONS_KV.put(
      `failed_notification:${Date.now()}:${crypto.randomUUID()}`,
      JSON.stringify({ contact_email: contactEmail, payload, error, failed_at: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 * 7 } // keep around for a week
    );
  } catch {

  }
}
