import type { Destination, Env } from "./types";

const DELIVERY_ENABLED_KEY = "settings:delivery_enabled";

export interface DashboardRecord {
  business_name: string;
  contact_email: string;
  body_text: string | null;
  duplicate?: boolean;
  duplicate_reason?: string;
  country: {
    raw: string | null;
    resolved: string | null;
    name: string | null;
    region: string | null;
    currency: string | null;
    calling_code: string | null;
    match_method: string;
  };
  routing: {
    destination: Destination;
    reason: string;
  };
  notification: {
    delivered?: boolean;
    skipped?: boolean;
    status?: number;
    error?: string;
  };
  delivery_mode?: "live" | "dry_run";
  processed_at: string;
  monthly_orders: number;
}

export interface DashboardSummaryItem {
  label: string;
  count: number;
}

export interface DashboardData {
  delivery_enabled: boolean;
  totals: {
    processed: number;
    delivered: number;
    dry_runs: number;
    failed_notifications: number;
    duplicates: number;
  };
  routes: DashboardSummaryItem[];
  countries: DashboardSummaryItem[];
  recent: DashboardRecord[];
}

export async function getDeliveryEnabled(env: Env): Promise<boolean> {
  const stored = await env.APPLICATIONS_KV.get(DELIVERY_ENABLED_KEY);
  return stored === null ? true : stored === "true";
}

export async function setDeliveryEnabled(env: Env, enabled: boolean): Promise<void> {
  await env.APPLICATIONS_KV.put(DELIVERY_ENABLED_KEY, String(enabled));
}

async function loadApplicationRecords(env: Env): Promise<DashboardRecord[]> {
  const records: DashboardRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.APPLICATIONS_KV.list({ prefix: "app:", cursor });
    for (const key of page.keys) {
      const raw = await env.APPLICATIONS_KV.get(key.name);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as DashboardRecord & { status?: string };
        if (parsed.status !== "processed") continue;
        records.push(parsed as DashboardRecord);
      } catch {
        // Skip malformed entries and keep the dashboard usable.
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  records.sort((left, right) => right.processed_at.localeCompare(left.processed_at));
  return records;
}

function summarizeBy<T>(items: T[], getLabel: (item: T) => string): DashboardSummaryItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = getLabel(item);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export async function getDashboardData(env: Env): Promise<DashboardData> {
  const deliveryEnabled = await getDeliveryEnabled(env);
  const records = await loadApplicationRecords(env);

  let delivered = 0;
  let dryRuns = 0;
  let failedNotifications = 0;
  let duplicates = 0;

  for (const record of records) {
    if (record.notification?.skipped) {
      dryRuns += 1;
    } else if (record.notification?.delivered) {
      delivered += 1;
    } else {
      failedNotifications += 1;
    }
    if (record.duplicate) {
      duplicates += 1;
    }
  }

  return {
    delivery_enabled: deliveryEnabled,
    totals: {
      processed: records.length,
      delivered,
      dry_runs: dryRuns,
      failed_notifications: failedNotifications,
      duplicates,
    },
    routes: summarizeBy(records, (record) => record.routing?.destination ?? "unknown"),
    countries: summarizeBy(records, (record) => {
      const label = record.country?.name || record.country?.resolved || record.country?.raw;
      return label ? `${label}${record.country?.resolved ? ` (${record.country.resolved})` : ""}` : "Unresolved";
    }),
    recent: records.slice(0, 12),
  };
}

