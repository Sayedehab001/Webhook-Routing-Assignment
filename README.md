<div align="center">

# 🤝 Partner Application Webhook

**A production-ready Cloudflare Worker that receives partner applications, enriches country data, detects duplicates with AI, routes to Discord channels, and provides an admin dashboard.**

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Hono.js](https://img.shields.io/badge/Hono.js-Framework-E36002)
![KV Storage](https://img.shields.io/badge/Storage-Cloudflare%20KV-F38020?logo=cloudflare&logoColor=white)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Routing Logic](#routing-logic)
- [Duplicate Detection](#duplicate-detection)
- [Country Enrichment](#country-enrichment)
- [Environment Variables](#environment-variables)
- [Pages](#pages)

---

## Overview

When a partner submits an application through the `/apply` page or a direct webhook call, the system runs it through a full pipeline:

1. **Validates** the payload — required fields, email format, order count
2. **Enriches** the country field — works even with dirty input like `"UAE"`, `"u.a.e"`, or a phone number with no country at all
3. **Detects duplicates** — exact body match first, then AI semantic similarity via Jina embeddings
4. **Routes** to the correct Discord channel based on region and monthly order volume
5. **Notifies** Discord with a rich embed — duplicates are flagged, never silently dropped
6. **Stores** the result in Cloudflare KV for idempotency and dashboard display

---

## Features

| Feature | Details |
|---|---|
| **Webhook ingestion** | Accepts JSON partner applications, validates all required fields |
| **Country enrichment** | Resolves raw input → ISO2 → region, currency, calling code |
| **Duplicate detection** | Exact body match + AI embeddings (Jina v5, cosine similarity ≥ 0.92) |
| **Smart routing** | Routes to Discord channels by order volume and region |
| **Discord notifications** | Rich embeds with full application detail and duplicate flag |
| **Admin dashboard** | Toggle delivery, send test payloads, inspect JSON, view stats |
| **Idempotency** | 30-day TTL deduplication by `application_id` |
| **Failed notification queue** | Stores failed Discord deliveries in KV for manual replay |

---

## Architecture

```
POST /webhook/partner-application
        │
        ▼
┌─────────────────────┐
│     Validation      │  Required fields, email format, orders ≥ 0
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Idempotency      │  application_id in KV? → return cached result immediately
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Country Enrichment │  alias table → phone inference → RestCountries API → fallback
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Duplicate Check    │  exact body+country → AI similarity (Jina embeddings)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Routing Decision   │  orders > 1000 → review | Europe → default | rest → high_value
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Discord Notify     │  rich embed → correct channel (respects delivery toggle)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    KV Storage       │  store result + update sender history
└─────────────────────┘
```

**Runtime:** Cloudflare Workers · **Framework:** Hono.js · **Storage:** Cloudflare KV
**External APIs:** RestCountries, Jina AI, Discord Webhooks

---

## Quick Start

### Prerequisites

- Node.js 18+
- Wrangler CLI — `npm install -g wrangler` or use `npx wrangler`
- A Cloudflare account
- Discord server with webhook URLs for 3 channels

### 1. Clone and install

```bash
git clone <repo-url>
cd partner-webhook
npm install
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create APPLICATIONS_KV
```

Copy the printed `id` into `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "APPLICATIONS_KV", id = "your-id-here", preview_id = "your-preview-id-here" }
]
```

### 3. Set Discord webhook secrets

```bash
npx wrangler secret put DISCORD_WEBHOOK_DEFAULT     # Europe channel
npx wrangler secret put DISCORD_WEBHOOK_HIGH_VALUE  # Others channel
npx wrangler secret put DISCORD_WEBHOOK_REVIEW      # High-volume channel
```

> **Where to get a Discord webhook URL:**
> Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL

### 4. Optional secrets

```bash
npx wrangler secret put RESTCOUNTRIES_API_KEY  # Improves country enrichment accuracy
npx wrangler secret put JINA_API_KEY           # Enables AI duplicate detection
npx wrangler secret put WEBHOOK_SHARED_SECRET  # Secures the webhook endpoint
```

### 5. Run locally

```bash
npx wrangler dev
# → http://localhost:8787
```

Secrets set via `wrangler secret put` are available automatically in local dev — Discord notifications will fire in both local and production environments.

---

## Deployment

```bash
npx wrangler deploy
```

Your worker goes live at:

```
https://partner-webhook.<your-subdomain>.workers.dev
```

> Redeployment always overwrites the previous version instantly. Your KV data (applications, history, settings) is stored separately and is **never affected** by redeployment.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/partner-application` | Submit a partner application |
| `GET` | `/api/dashboard` | Dashboard stats and recent submissions |
| `GET` | `/api/settings/delivery` | Get current delivery toggle state |
| `POST` | `/api/settings/delivery` | Enable or disable Discord delivery |
| `GET` | `/admin/failed-notifications` | List failed Discord deliveries |

### POST `/webhook/partner-application`

**Request body:**

```json
{
  "application_id": "partner-2024-001",
  "business_name": "Acme Commerce",
  "contact_email": "hello@acme.com",
  "body": "We would love to partner with Grubtech...",
  "country": "UAE",
  "phone": "+971501234567",
  "monthly_orders": 800,
  "submitted_at": "2025-06-01T10:00:00Z"
}
```

**Response:**

```json
{
  "status": "processed",
  "application_id": "partner-2024-001",
  "duplicate": false,
  "duplicate_reason": "no previous sender history",
  "country": {
    "raw": "UAE",
    "resolved": "AE",
    "name": "United Arab Emirates",
    "region": "Asia",
    "currency": "AED",
    "calling_code": "+971",
    "match_method": "alias"
  },
  "routing": {
    "destination": "high_value",
    "reason": "Non-European country (United Arab Emirates) — routed to others channel"
  },
  "notification": { "delivered": true, "status": 204 },
  "delivery_mode": "live",
  "processed_at": "2025-06-01T10:00:01Z"
}
```

---

## Routing Logic

```
monthly_orders > 1000  ──────────────────────→  REVIEW channel     (all countries)
        │
        ▼  (orders ≤ 1000)
European country?  ──── yes ────────────────→  DEFAULT channel     (Europe)
        │
        no
        ▼
                                             HIGH_VALUE channel     (rest of world)
```

| Condition | Secret | Purpose |
|-----------|--------|---------|
| `monthly_orders > 1000` | `DISCORD_WEBHOOK_REVIEW` | High-volume, needs manual review |
| Europe + orders ≤ 1000 | `DISCORD_WEBHOOK_DEFAULT` | European partners |
| Non-Europe + orders ≤ 1000 | `DISCORD_WEBHOOK_HIGH_VALUE` | Rest of world |

> European countries are detected by **both** the `region` field from RestCountries **and** a hardcoded set of 46 ISO2 codes — routing works correctly even when the enrichment API is unavailable.

---

## Duplicate Detection

Every submission always goes through the full pipeline and is always sent to Discord. Duplicates are **flagged with a label**, never silently dropped — your team decides what to do with them.

```
Same application_id                          →  skip (exact replay, return cached result)

Same email + same body + same country        →  duplicate ⚠️  (flagged on Discord)
Same email + same body + different country   →  fresh    ✅  (new market application)

AI similarity ≥ 0.92 + same country         →  duplicate ⚠️  (flagged on Discord)
AI similarity ≥ 0.92 + different country    →  fresh    ✅  (new market application)

Score < 0.92 or no score                    →  fresh    ✅
```

> AI similarity uses **Jina embeddings v5** (`jina-embeddings-v5-text-small`, cosine similarity).
> Requires `JINA_API_KEY` — if not set, only exact body matching is used.

---

## Country Enrichment

Resolution stops at the first successful match:

| Priority | Method | Example |
|----------|--------|---------|
| 1 | **Local alias table** | `"UAE"` → `AE`, `"KSA"` → `SA`, `"UK"` → `GB` |
| 2 | **Phone calling-code** | `"+33..."` → `FR` (used when country field is missing) |
| 3 | **RestCountries API** | Full lookup by ISO2 or name — adds region, currency, calling code |
| 4 | **Local name fallback** | Returns ISO2 + known name if API is unreachable |
| 5 | **Unresolved** | Returns `null` fields — webhook never crashes over a bad country |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_WEBHOOK_DEFAULT` | ✅ | Europe channel webhook URL |
| `DISCORD_WEBHOOK_HIGH_VALUE` | ✅ | Others (non-Europe) channel webhook URL |
| `DISCORD_WEBHOOK_REVIEW` | ✅ | High-volume (> 1000 orders) channel webhook URL |
| `RESTCOUNTRIES_API_KEY` | ⬜ | Improves country enrichment accuracy |
| `JINA_API_KEY` | ⬜ | Enables AI-based semantic duplicate detection |
| `WEBHOOK_SHARED_SECRET` | ⬜ | Requires `x-webhook-secret` header on all POST requests |

> **Never put webhook URLs in `wrangler.toml`.** Always use `npx wrangler secret put <NAME>`.

---

## Pages

| URL | Audience | Description |
|-----|----------|-------------|
| `/apply` | Partners (public) | Clean application form — submits directly to the webhook |
| `/dashboard` | Admin only | Stats, routing breakdown, recent submissions, JSON inspector, delivery toggle |

---

<div align="center">
  <sub>Built on Cloudflare Workers · Hono.js · Discord · Jina AI · RestCountries</sub>
</div>
