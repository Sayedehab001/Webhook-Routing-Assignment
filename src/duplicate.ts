import type { Env, ValidatedApplication } from "./types";
import { isDuplicateByAi } from "./externalValidation";

const APPLICATION_PREFIX = "app:";
const MAX_HISTORY_ENTRIES = 50;
const AI_DUPLICATE_THRESHOLD = 0.9;

export interface EmailHistoryEntry {
  application_id: string;
  contact_email: string;
  body_text: string | null;

  country_iso2: string | null;
  processed_at: string;
}

export interface DuplicateDecision {
  isDuplicate: boolean;
  reason: string;
  matchedApplicationId?: string;
  similarityScore?: number | null;
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
          application_id: String(parsed.application_id ?? ""),
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
 * Duplicate rules:
 *   1. No prior history → fresh.
 *   2. Same body + DIFFERENT country → fresh (new market, genuine request).
 *   3. Same body + same (or unknown) country → duplicate.
 *   4. AI score ≥ threshold + different country → fresh.
 *   5. AI score ≥ threshold + same (or unknown) country → duplicate.
 *   6. Score below threshold / no score → fresh.
 *
 * Country comparison treats null/null as "unknown on both sides" and does
 * NOT treat two unknowns as matching — we'd rather false-negative (let a
 * possible duplicate through) than false-positive (block a real request).
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
    return { isDuplicate: false, reason: "no previous sender history" };
  }

  const currentBody = normalizeBody(application.body_text);
  const currentIso2 = resolvedIso2;

  // ── Exact body match ──────────────────────────────────────────────────────
  const exactMatch = history.find((e) => normalizeBody(e.body_text) === currentBody);
  if (exactMatch) {
    const countryChanged =
      currentIso2 && exactMatch.country_iso2 && currentIso2 !== exactMatch.country_iso2;
    if (countryChanged) {
      return {
        isDuplicate: false,
        reason: `same body but country changed ${exactMatch.country_iso2} → ${currentIso2} — treated as fresh`,
        matchedApplicationId: exactMatch.application_id,
        similarityScore: 1,
      };
    }
    return {
      isDuplicate: true,
      reason: `same contact_email, identical body, same country (${currentIso2 ?? "unknown"})`,
      matchedApplicationId: exactMatch.application_id,
      similarityScore: 1,
    };
  }

  if (!currentBody) {
    return { isDuplicate: false, reason: "no body text provided for comparison" };
  }

  // ── AI similarity check ───────────────────────────────────────────────────
  const candidates = history
    .slice(0, 5)
    .map((e) => ({ body: normalizeBody(e.body_text), entry: e }))
    .filter((x): x is { body: string; entry: EmailHistoryEntry } => Boolean(x.body));

  let bestScore: number | null = null;
  let bestMatch: EmailHistoryEntry | null = null;

  for (const { body: candidateBody, entry } of candidates) {
    const aiResult = await isDuplicateByAi(candidateBody, currentBody, env);
    if (aiResult.score === null) continue;
    if (bestScore === null || aiResult.score > bestScore) {
      bestScore = aiResult.score;
      bestMatch = entry;
    }
    if (aiResult.score >= AI_DUPLICATE_THRESHOLD) {
      const countryChanged =
        currentIso2 && entry.country_iso2 && currentIso2 !== entry.country_iso2;
      if (countryChanged) {
        return {
          isDuplicate: false,
          reason: `similar body (score ${aiResult.score.toFixed(3)}) but country changed ${entry.country_iso2} → ${currentIso2} — treated as fresh`,
          matchedApplicationId: entry.application_id,
          similarityScore: aiResult.score,
        };
      }
      return {
        isDuplicate: true,
        reason: `same contact_email, AI similarity ${aiResult.score.toFixed(3)}, same country (${currentIso2 ?? "unknown"})`,
        matchedApplicationId: bestMatch?.application_id,
        similarityScore: aiResult.score,
      };
    }
  }

  return {
    isDuplicate: false,
    reason:
      bestScore === null
        ? "no AI similarity result available"
        : `similarity ${bestScore.toFixed(3)} below threshold`,
    similarityScore: bestScore,
  };
}

export async function recordSenderHistory(
  env: Env,
  application: ValidatedApplication,
  resolvedIso2: string | null
): Promise<void> {
  const history = await loadHistory(env, application.contact_email);
  history.unshift({
    application_id: application.application_id,
    contact_email: application.contact_email,
    body_text: normalizeBody(application.body_text),
    country_iso2: resolvedIso2 ?? null,
    processed_at: new Date().toISOString(),
  });
  await saveHistory(env, application.contact_email, history);
}
