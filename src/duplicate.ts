import type { Env, ValidatedApplication } from "./types";

const APPLICATION_PREFIX = "app:";
const MAX_HISTORY_ENTRIES = 50;

export interface EmailHistoryEntry {
  contact_email: string;
  body_text: string | null;
  country_iso2: string | null;
  processed_at: string;
}

export interface DuplicateDecision {
  isDuplicate: boolean;
  reason: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBody(body: string | null): string | null {
  if (!body) return null;
  return body.trim();
}

async function loadHistory(env: Env, email: string): Promise<EmailHistoryEntry[]> {
  const matched: EmailHistoryEntry[] = [];
  const targetEmail = normalizeEmail(email);
  let cursor: string | undefined;
  do {
    const page = await env.APPLICATIONS_KV.list({ prefix: APPLICATION_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await env.APPLICATIONS_KV.get(key.name);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<EmailHistoryEntry> & {
          contact_email?: string;
          country?: { resolved?: string | null };
        };
        if (!parsed.contact_email || normalizeEmail(parsed.contact_email) !== targetEmail) continue;
        const iso2 =
          typeof parsed.country_iso2 === "string"
            ? parsed.country_iso2
            : (parsed.country?.resolved ?? null);
        matched.push({
          contact_email: parsed.contact_email,
          body_text: typeof parsed.body_text === "string" ? parsed.body_text : null,
          country_iso2: iso2,
          processed_at: typeof parsed.processed_at === "string" ? parsed.processed_at : new Date().toISOString(),
        });
      } catch { /* skip malformed */ }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return matched.sort((a, b) => b.processed_at.localeCompare(a.processed_at));
}

async function loadCachedHistory(env: Env, email: string): Promise<EmailHistoryEntry[]> {
  const raw = await env.APPLICATIONS_KV.get(`email:${normalizeEmail(email)}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as EmailHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveHistory(env: Env, email: string, history: EmailHistoryEntry[]): Promise<void> {
  await env.APPLICATIONS_KV.put(
    `email:${normalizeEmail(email)}`,
    JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)),
    { expirationTtl: 60 * 60 * 24 * 30 }
  );
}

/**
 * Duplicate rules — driven purely by contact_email + body_text, no AI call:
 *   1. No prior submission from this email → fresh.
 *   2. Same email, identical body, DIFFERENT country → fresh (new market,
 *      genuine request — e.g. they're now applying to operate in Egypt
 *      instead of the UAE).
 *   3. Same email, identical body, same (or unknown) country → duplicate.
 *   4. Same email, different body → fresh (a new message from a known
 *      sender isn't automatically a duplicate).
 *
 * Country comparison treats null/null as "unknown on both sides" and does
 * NOT treat two unknowns as matching — we'd rather false-negative (let a
 * possible duplicate through) than false-positive (block a real request).
 *
 * Note: regardless of the outcome here, the caller still sends every
 * request to Discord — this function only decides the "duplicate" label
 * attached to it, it never blocks delivery.
 */
export async function detectDuplicateApplication(
  env: Env,
  application: ValidatedApplication,
  resolvedIso2: string | null
): Promise<DuplicateDecision> {
  const history = [
    ...(await loadHistory(env, application.contact_email)),
    ...(await loadCachedHistory(env, application.contact_email)),
  ];

  if (history.length === 0) {
    return { isDuplicate: false, reason: "no previous submission from this email" };
  }

  const currentBody = normalizeBody(application.body_text);
  const currentIso2 = resolvedIso2;

  const exactMatch = history.find((e) => normalizeBody(e.body_text) === currentBody);
  if (exactMatch) {
    const countryChanged =
      currentIso2 && exactMatch.country_iso2 && currentIso2 !== exactMatch.country_iso2;
    if (countryChanged) {
      return {
        isDuplicate: false,
        reason: `same email and body but country changed ${exactMatch.country_iso2} → ${currentIso2} — treated as fresh`,
      };
    }
    return {
      isDuplicate: true,
      reason: `same email, identical body, same country (${currentIso2 ?? "unknown"})`,
    };
  }

  return {
    isDuplicate: false,
    reason: "same email but different body — treated as fresh",
  };
}

export async function recordSenderHistory(
  env: Env,
  application: ValidatedApplication,
  resolvedIso2: string | null
): Promise<void> {
  const history = await loadHistory(env, application.contact_email);
  history.unshift({
    contact_email: application.contact_email,
    body_text: normalizeBody(application.body_text),
    country_iso2: resolvedIso2 ?? null,
    processed_at: new Date().toISOString(),
  });
  await saveHistory(env, application.contact_email, history);
}
