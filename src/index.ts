import { Hono } from "hono";
import type { Env, RawApplicationPayload } from "./types";
import { validatePayload } from "./validate";
import { enrichCountry } from "./enrich";
import { decideDestination } from "./route";
import { notifyDiscord } from "./notify";
import { getDashboardData, getDeliveryEnabled, setDeliveryEnabled } from "./dashboard";
import { renderDashboardPage } from "./dashboardHtml";
import { renderApplicationPage } from "./applicationHtml";
import { detectDuplicateApplication, recordSenderHistory } from "./duplicate";

const app = new Hono<{ Bindings: Env }>();

const RECORD_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

app.get("/", (c) => c.json({ service: "partner-webhook", status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));
app.get("/dashboard", (c) => c.html(renderDashboardPage()));
app.get("/apply", (c) => c.html(renderApplicationPage()));
app.get("/api/dashboard", async (c) => c.json(await getDashboardData(c.env)));
app.get("/api/settings/delivery", async (c) => c.json({ enabled: await getDeliveryEnabled(c.env) }));
app.post("/api/settings/delivery", async (c) => {
  let body: { enabled?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid_json" }, 400); }
  if (typeof body.enabled !== "boolean") {
    return c.json({ error: "validation_failed", message: "enabled must be a boolean." }, 422);
  }
  await setDeliveryEnabled(c.env, body.enabled);
  return c.json({ enabled: body.enabled });
});

app.post("/webhook/partner-application", async (c) => {
  const env = c.env;

  if (env.WEBHOOK_SHARED_SECRET) {
    const provided = c.req.header("x-webhook-secret");
    if (provided !== env.WEBHOOK_SHARED_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  let raw: RawApplicationPayload;
  try { raw = await c.req.json(); } catch {
    return c.json({ error: "invalid_json", message: "Request body is not valid JSON." }, 400);
  }

  const validation = validatePayload(raw);
  if (!validation.ok || !validation.data) {
    return c.json({ error: "validation_failed", message: "Payload was valid JSON but failed validation.", details: validation.errors }, 422);
  }
  const application = validation.data;

  // ── Enrich country first so duplicate check can compare ISO2 codes ────────
  const enriched = await enrichCountry(application.country_raw, application.phone, env);
  const resolvedIso2 = enriched.iso2;

  // ── Duplicate detection: same contact_email + same body_text = duplicate.
  //    A different country on the same email/body is treated as fresh. This
  //    never blocks the request — it only labels it, see below. ────────────
  const duplicateDecision = await detectDuplicateApplication(env, application, resolvedIso2);

  // ── Route (unaffected by duplicate status) ─────────────────────────────────
  const decision = decideDestination(enriched, application.monthly_orders);
  const deliveryEnabled = await getDeliveryEnabled(env);

  // ── Notify — ALWAYS sent to Discord, duplicate or fresh; the embed just
  //    carries a "duplicate" vs "fresh" label so the team can see at a glance ──
  const notifyResult = await notifyDiscord(
    env, application, enriched, decision.destination, decision.reason,
    deliveryEnabled,
    duplicateDecision.isDuplicate ? "duplicate" : "fresh"
  );

  const result = {
    status: "processed",
    business_name: application.business_name,
    contact_email: application.contact_email,
    body_text: application.body_text,
    duplicate: duplicateDecision.isDuplicate,
    duplicate_reason: duplicateDecision.reason,
    country: {
      raw: application.country_raw,
      resolved: enriched.iso2,
      name: enriched.name,
      region: enriched.region,
      currency: enriched.currency,
      calling_code: enriched.calling_code,
      match_method: enriched.match_method,
    },
    routing: decision,
    notification: notifyResult,
    delivery_mode: deliveryEnabled ? "live" : "dry_run",
    processed_at: new Date().toISOString(),
  };

  // Storage key is an internal, generated identifier — never surfaced to
  // the caller or the UI. Duplicate detection is keyed off email + body
  // (see duplicate.ts), not off this key.
  const kvKey = `app:${crypto.randomUUID()}`;
  await env.APPLICATIONS_KV.put(kvKey, JSON.stringify(result), { expirationTtl: RECORD_TTL_SECONDS });
  await recordSenderHistory(env, application, resolvedIso2);

  return c.json(result, 200);
});

app.get("/admin/failed-notifications", async (c) => {
  const list = await c.env.APPLICATIONS_KV.list({ prefix: "failed_notification:" });
  const items = await Promise.all(list.keys.map(async (k) => {
    const value = await c.env.APPLICATIONS_KV.get(k.name);
    return { key: k.name, value: value ? JSON.parse(value) : null };
  }));
  return c.json({ count: items.length, items });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
export default app;
