# AboveTopSecret Dash

Self-hosted ad performance tracking dashboard for Facebook Ads, Checkout Champ, and Shopify.

## Quick Start

```bash
git clone <repo-url> && cd abovetopsecret-dash
cp .env.example .env
# Edit .env with your tokens
docker-compose up --build
```

Open `http://localhost` (port 80) for the dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│    Nginx     │────▶│   Vite/React │
│  (PWA)       │     │   :80        │     │   Client     │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    /api/* │
                           ▼
                    ┌──────────────┐     ┌──────────────┐
                    │   Express    │────▶│  PostgreSQL   │
                    │   Server     │     │   :5432       │
                    │   :4000      │     └──────────────┘
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Facebook │ │ Checkout │ │  Shopify  │
        │ Ads API  │ │  Champ   │ │ Webhooks  │
        └──────────┘ └──────────┘ └──────────┘
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_PASSWORD` | No | PostgreSQL password (default: `changeme`) |
| `AUTH_TOKEN` | No | Dashboard access token. If unset, auth is disabled (dev mode). |
| `FB_ACCESS_TOKEN` | No | Facebook Marketing API access token |
| `FB_AD_ACCOUNT_IDS` | No | Comma-separated Facebook ad account IDs (e.g., `act_123,act_456`) |
| `CC_WEBHOOK_SECRET` | No | Checkout Champ webhook signing secret |
| `SHOPIFY_WEBHOOK_SECRET` | No | Shopify webhook HMAC secret |
| `ALLOWED_ORIGIN` | No | CORS allowed origins (comma-separated). Defaults to same-origin in production. |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (no auth) |
| GET | `/api/metrics?offer=X&account=Y` | Flat table metrics data |
| GET | `/api/metrics/summary` | Top-line KPIs (spend, revenue, ROI, orders) |
| GET | `/api/export/csv` | Download metrics as CSV |
| POST | `/api/webhooks/checkout-champ` | Checkout Champ order webhook |
| POST | `/api/webhooks/shopify` | Shopify order webhook |
| POST | `/api/sync/facebook` | Manually trigger Facebook ad sync |
| GET | `/api/overrides` | List manual metric overrides |
| POST | `/api/overrides` | Create/update an override |
| DELETE | `/api/overrides/:id` | Delete an override |

## Facebook API Setup

1. Go to [Facebook Business Settings](https://business.facebook.com/settings)
2. Create a System User with `ads_read` permission
3. Generate a long-lived access token
4. Copy your Ad Account IDs (format: `act_XXXXXXXXX`)
5. Set `FB_ACCESS_TOKEN` and `FB_AD_ACCOUNT_IDS` in `.env`

The server syncs Facebook data every 10 minutes automatically.

## Checkout Champ Webhook

1. In your Checkout Champ account, go to Settings > Webhooks
2. Add a new webhook pointing to: `https://your-domain/api/webhooks/checkout-champ`
3. Set the webhook secret and copy it to `CC_WEBHOOK_SECRET` in `.env`
4. Select "Order Created" events

Expected payload fields: `order_id`, `offer_name`, `revenue`, `new_customer`, `utm_campaign`, `fbclid`, `subscription_id`, `quantity`, `is_core_sku`, `upsells[]`

## Shopify Webhook

1. In Shopify Admin, go to Settings > Notifications > Webhooks
2. Add a webhook for "Order creation" pointing to: `https://your-domain/api/webhooks/shopify`
3. Copy the HMAC secret to `SHOPIFY_WEBHOOK_SECRET` in `.env`

## PWA Installation

### iOS
1. Open the dashboard in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

### Android
1. Open the dashboard in Chrome
2. Tap the three-dot menu
3. Tap "Add to Home screen" or "Install app"

## Manual Overrides

1. Click the Settings button in the dashboard header
2. Select a metric, offer (or "ALL" for global), and enter the override value
3. Overridden cells show a yellow asterisk (*) in the table
4. Delete overrides from the same panel

## Development

```bash
# Start database
docker-compose up db

# Server (separate terminal)
cd server && npm install && npm run dev

# Client (separate terminal)
cd client && npm install && npm run dev
```

## Daily Reset

At midnight (server time), the scheduler:
1. Archives today's FB ads and orders as JSONB into archive tables
2. Truncates the working tables for the new day

## Security

- **Auth**: Token-based with timing-safe comparison. Stored in memory only (not localStorage).
- **CORS**: Restricted to `ALLOWED_ORIGIN` in production. Same-origin by default.
- **Webhooks**: HMAC signature verification with raw body buffer. In production, webhooks are rejected if no secret is configured.
- **Rate Limiting**: API (120/min), webhooks (300/min), auth (15 attempts/15min).
- **SQL**: All queries use parameterized statements. No string interpolation.
- **CSV**: Values sanitized against formula injection.

## Known Limitations

- **Bounce Rate**: Requires Google Analytics integration. Not available in this dashboard.
- **LP CTR**: Requires the Facebook Ad account to have landing page view tracking enabled. If the field returns null, LP CTR will show 0%.
- **Multi-offer spend attribution**: If one ad set drives orders for multiple offers, the ad set's spend appears under each offer in the table. Summary cards use independent queries and are always correct.
- **Timezone**: Daily reset runs at midnight server time, not the advertiser's timezone.
- **Seed data**: Fresh deployments include test data for development. For production, clear the working tables after initial setup.
