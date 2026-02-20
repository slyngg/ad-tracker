# OpticData

AI-powered ad analytics platform for direct-response marketers.

**optic-data.com**

---

## Features

### Real-time Dashboard
Live KPI cards with animated number transitions, a live order feed, WebSocket push updates, and previous-period delta badges for at-a-glance performance tracking.

### AI Operator
Claude Sonnet-powered conversational assistant with 15 tools: campaign metrics, order stats, ROAS analysis, arbitrary SQL queries, pause/enable/adjust ad sets, list/create/toggle automation rules, query historical data, and send notifications. Responses stream via SSE with full markdown rendering. A memory system (powered by Haiku) extracts and recalls key facts across sessions.

### Voice Interface
Web Speech API for both input and output. Supports a "Hey Optics" wake word, hands-free mode, and auto-send so operators can interact without touching the keyboard.

### Automation Rules
Seven action types: notification, webhook, flag_review, pause_adset, enable_adset, adjust_budget, and slack_notify. Rules fire on metric threshold triggers with a configurable cooldown system. All executions are logged for auditability.

### Multi-source Data Ingestion
- **Facebook Marketing API** -- scheduled cron sync of campaign, ad set, and ad-level metrics.
- **CheckoutChamp** -- inbound webhooks for order events, plus optional polling via CC API.
- **Shopify** -- inbound webhooks for order creation events.
- **CSV Upload** -- manual cost/revenue data import.

### Slack Bot
Slash commands via `/optic`: status, roas, spend, cpa, revenue, offers, and ask. Supports @mention interactions. The `ask` command delegates to the AI Operator tool-calling pipeline for natural-language queries.

### Embeddable Widget
Vanilla JS widget loadable on any page via a script tag. Authenticates with a SHA256-hashed API key, receives live updates over WebSocket, and supports configurable metrics, position, theme, number animation, and color flash on value changes.

### Security
JWT authentication, bcrypt password hashing, SHA256-hashed API keys and webhook tokens, HMAC webhook signature verification, parameterized SQL queries, header injection sanitization, and rate limiting (API 120/min, webhooks 300/min, auth 15 attempts/15 min).

### Analytics
Attribution dashboard, source/medium breakdown, funnel analysis, P&L reporting, timeseries charting, and CSV export.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, Zustand, Recharts, React Router |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 |
| AI | Anthropic Claude API (Sonnet for Operator and Slack, Haiku for memory extraction) |
| Real-time | WebSocket (ws) |
| Deployment | Docker, Caddy reverse proxy |

---

## Quick Start

```bash
# Clone and configure
git clone <repo-url> && cd abovetopsecret-dash
cp .env.example .env   # Fill in required values (see below)

# Development
docker-compose up -d

# Production
docker-compose -f deploy/docker-compose.prod.yml up -d
```

The development stack exposes the client on port 80 and the API on port 4000. The production stack uses Caddy for automatic HTTPS on your configured domain.

---

## Environment Variables

All variables are defined in `.env.example`. Copy it to `.env` and fill in the values relevant to your deployment.

### Required

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Secret used to sign JWT tokens |
| `ANTHROPIC_API_KEY` | Anthropic API key for the AI Operator and Slack bot |

### Facebook Ads

| Variable | Description |
|----------|-------------|
| `FB_ACCESS_TOKEN` | Facebook Marketing API access token (system user with `ads_read` permission) |
| `FB_AD_ACCOUNT_IDS` | Comma-separated ad account IDs (e.g., `act_123456789,act_987654321`) |

### Slack (optional)

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot user OAuth token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Request signing secret for verifying Slack payloads |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode (`xapp-...`) |

### Other

| Variable | Description |
|----------|-------------|
| `AUTH_TOKEN` | Legacy dashboard access token (dev mode fallback) |
| `CC_WEBHOOK_SECRET` | CheckoutChamp webhook signing secret |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify webhook HMAC secret |
| `CC_API_KEY` | CheckoutChamp API key (optional, for polling) |
| `CC_API_URL` | CheckoutChamp API base URL |
| `ALLOWED_ORIGIN` | Comma-separated CORS origins (defaults to same-origin) |
| `DOMAIN` | Production domain for Caddy (used in `deploy/docker-compose.prod.yml`) |

---

## API Endpoints

| Group | Path Prefix | Description |
|-------|-------------|-------------|
| Auth | `/api/auth` | Register, login, profile |
| Metrics | `/api/metrics` | Summary KPIs, flat table data |
| Operator | `/api/operator` | Chat (SSE streaming), conversations, memories |
| Rules | `/api/rules` | CRUD for automation rules, execution logs |
| Webhooks | `/api/webhooks` | CheckoutChamp and Shopify inbound webhooks |
| Analytics | `/api/analytics` | Timeseries, source breakdown, funnel, P&L |
| Settings | `/api/settings` | Application configuration |
| API Keys | `/api/api-keys` | API key management for the embeddable widget |
| Notifications | `/api/notifications` | Notification listing and management |
| Export | `/api/export` | CSV download |
| Sync | `/api/sync` | Manual Facebook sync trigger |
| Upload | `/api/upload` | CSV data import |
| Overrides | `/api/overrides` | Manual metric overrides |
| Pixel Configs | `/api/pixel-configs` | Multi-pixel configuration |
| Webhook Tokens | `/api/webhook-tokens` | Webhook token management |
| Costs | `/api/costs` | Cost data management |

---

## Architecture

Express server backed by PostgreSQL 16. The WebSocket server shares the same HTTP server instance, providing real-time push updates to both the dashboard and the embeddable widget. A cron scheduler handles periodic Facebook ad sync and daily data archival/reset. The AI Operator streams responses via Server-Sent Events (SSE) and has access to 15 tools for querying data, managing ad sets, and controlling automation rules.

```
                         +-----------+
                         |   Caddy   |  (HTTPS, reverse proxy)
                         +-----+-----+
                               |
              +----------------+----------------+
              |                |                |
         /api/* & /ws      static           /deploy
              |                |             webhook
              v                v                |
       +------+------+   +----+----+            v
       |   Express   |   |  React  |     +-----------+
       |   Server    |   |  Client |     | Deployment|
       |  :4000      |   |  :80    |     |  Listener |
       +------+------+   +---------+     +-----------+
              |
     +--------+--------+
     |        |        |
     v        v        v
  +----+  +-----+  +-------+
  | PG |  | WS  |  | Cron  |
  | 16 |  | Hub |  | Sched |
  +----+  +-----+  +-------+
              |
     +--------+--------+
     |                  |
  Dashboard          Widget
  (browser)         (embed)
```

External integrations: Facebook Marketing API, CheckoutChamp (webhooks + optional API polling), Shopify (webhooks), Slack (Socket Mode via Bolt SDK), and Anthropic Claude API.

---

## Deployment

### Production

The production stack is defined in `deploy/docker-compose.prod.yml`. It includes four services:

1. **db** -- PostgreSQL 16 with persistent volume and health checks.
2. **server** -- Express API server.
3. **client** -- React SPA served by a static file server.
4. **caddy** -- Caddy 2 reverse proxy with automatic HTTPS via Let's Encrypt.

The Caddy configuration lives in `deploy/Caddyfile` and routes `/api/*` and `/ws` to the server, static assets to the client, and handles a `www` redirect.

```bash
# Set your domain
export DOMAIN=optic-data.com

# Start production
docker-compose -f deploy/docker-compose.prod.yml up -d
```

### Development

```bash
# Full stack via Docker
docker-compose up -d

# Or run services individually
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

---

## License

Proprietary. All rights reserved.
