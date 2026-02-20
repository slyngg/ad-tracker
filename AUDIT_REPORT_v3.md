# AUDIT REPORT v3 — OpticData Command Center

**Date:** 2026-02-20
**System:** optic-data.com
**Scope:** Full system state after Sprint 1 (Navigation), Sprint 2 (Settings/Data), Sprint 3 (Operator AI)
**Auditor:** Automated code audit — every file read, every line traced

---

## SECTION A: File Inventory

**Total files (excluding node_modules, .git, dist): 97**

### Root (`/tracker/`)
```
AboveTopSecret_Dashboard_Prototype.jsx
AboveTopSecret_Tracking_Blueprint.docx
AUDIT_REPORT.md
AUDIT_REPORT_v2.md
```

### Config & Deploy (`abovetopsecret-dash/`)
```
.env.example
docker-compose.yml
README.md
```

### Deploy (`abovetopsecret-dash/deploy/`)
```
Caddyfile
deploy.sh
docker-compose.prod.yml
opticdata-webhook.service
setup-autodeploy.sh
setup-vps.sh
webhook-listener.js
```

### Database (`abovetopsecret-dash/db/`)
```
init.sql
reset-daily.sql
migrations/002-add-tax-and-settings.sql
migrations/003-overrides-unique-constraint.sql
migrations/004-platform-expansion.sql
migrations/005-multi-user-auth.sql
migrations/006-sprint3-fixes.sql
```

### Server (`abovetopsecret-dash/server/`)
```
Dockerfile
package.json
package-lock.json
tsconfig.json
src/db.ts
src/index.ts
src/middleware/auth.ts
src/middleware/webhook-verify.ts
src/queries/core-metrics.sql
src/queries/extended-metrics.sql
src/queries/summary.sql
src/routes/analytics.ts
src/routes/api-keys.ts
src/routes/auth.ts
src/routes/costs.ts
src/routes/export.ts
src/routes/metrics.ts
src/routes/notifications.ts
src/routes/operator.ts
src/routes/overrides.ts
src/routes/pixel-configs.ts
src/routes/rules.ts
src/routes/settings.ts
src/routes/sql-builder.ts
src/routes/sync.ts
src/routes/upload.ts
src/routes/webhook-tokens.ts
src/routes/webhooks.ts
src/services/cc-polling.ts
src/services/checkout-champ.ts
src/services/facebook-sync.ts
src/services/notifications.ts
src/services/rules-engine.ts
src/services/scheduler.ts
src/services/settings.ts
src/services/shopify.ts
```

### Client (`abovetopsecret-dash/client/`)
```
Dockerfile
index.html
package.json
package-lock.json
postcss.config.js
tailwind.config.js
tsconfig.json
tsconfig.node.json
vite.config.ts
public/icon-192.png
public/icon-512.png
public/manifest.json
public/sw.js
```

### Client Source (`client/src/`)
```
App.tsx
main.tsx
styles/globals.css
lib/api.ts
lib/formatters.ts
lib/routes.ts
hooks/useMetrics.ts
stores/authStore.ts
stores/sidebarStore.ts
types/navigation.ts
```

### Client Components (`client/src/components/`)
```
auth/AuthGate.tsx
auth/LoginPage.tsx
charts/ConversionFunnel.tsx
charts/MetricSparkline.tsx
charts/PieBreakdown.tsx
charts/ROIChart.tsx
charts/SpendRevenueChart.tsx
dashboard/ExportButton.tsx
dashboard/Filters.tsx
dashboard/MetricsTable.tsx
dashboard/MobileCard.tsx
dashboard/SummaryCards.tsx
layout/AppLayout.tsx
layout/NavItem.tsx
layout/NavSection.tsx
layout/Sidebar.tsx
shared/CommandPalette.tsx
shared/LoadingSpinner.tsx
shared/PageShell.tsx
shared/PlaceholderPage.tsx
```

### Client Pages (`client/src/pages/`)
```
SummaryDashboard.tsx
acquisition/AttributionDashboard.tsx
acquisition/SourceMediumPage.tsx
customers/CohortAnalysisPage.tsx
customers/CustomerSegmentsPage.tsx
customers/LTVAnalysisPage.tsx
data/APIKeysPage.tsx
data/DataUploadPage.tsx
data/IntegrationsPage.tsx
data/SQLBuilderPage.tsx
discovery/AIVisibilityPage.tsx
discovery/KeywordIntelligencePage.tsx
discovery/SocialMonitoringPage.tsx
operator/OperatorPage.tsx
rules/RulesEnginePage.tsx
settings/AccountPage.tsx
settings/ConnectionsPage.tsx
settings/CostSettingsPage.tsx
settings/GeneralSettingsPage.tsx
settings/NotificationsPage.tsx
settings/OverridesPage.tsx
settings/TrackingSettingsPage.tsx
website/SiteSearchPage.tsx
website/WebsiteFunnelPage.tsx
website/WebsitePerformancePage.tsx
```

---

## SECTION B: Dependency Manifest

### Server Dependencies (Production)

| Package | Version | Notes |
|---------|---------|-------|
| `@anthropic-ai/sdk` | ^0.78.0 | **SHIFT-CRITICAL** — Claude API for Operator AI |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `cors` | ^2.8.5 | CORS middleware |
| `express` | ^4.18.2 | Web framework |
| `express-rate-limit` | ^8.2.1 | **SHIFT-CRITICAL** — Rate limiting (v1 fix #9) |
| `jsonwebtoken` | ^9.0.3 | JWT authentication (Sprint 2) |
| `node-cron` | ^3.0.3 | Scheduled tasks |
| `pg` | ^8.12.0 | PostgreSQL client |

### Server Dev Dependencies

| Package | Version |
|---------|---------|
| `@types/bcryptjs` | ^2.4.6 |
| `@types/cors` | ^2.8.17 |
| `@types/express` | ^4.17.21 |
| `@types/jsonwebtoken` | ^9.0.10 |
| `@types/node` | ^20.11.5 |
| `@types/node-cron` | ^3.0.11 |
| `@types/pg` | ^8.10.9 |
| `tsx` | ^4.7.0 |
| `typescript` | ^5.3.3 |

### Client Dependencies (Production)

| Package | Version | Notes |
|---------|---------|-------|
| `lucide-react` | ^0.575.0 | Icon library |
| `react` | ^18.2.0 | Core React |
| `react-dom` | ^18.2.0 | React DOM |
| `react-hot-toast` | ^2.6.0 | Toast notifications |
| `react-router-dom` | ^7.13.0 | **SHIFT-CRITICAL** — v7 (latest major) |
| `recharts` | ^3.7.0 | Charting library |
| `zustand` | ^5.0.11 | State management |

### Client Dev Dependencies

| Package | Version |
|---------|---------|
| `@types/react` | ^18.2.48 |
| `@types/react-dom` | ^18.2.18 |
| `@vitejs/plugin-react` | ^4.2.1 |
| `autoprefixer` | ^10.4.17 |
| `postcss` | ^8.4.33 |
| `tailwindcss` | ^3.4.1 |
| `typescript` | ^5.3.3 |
| `vite` | ^5.0.12 |

### Voice-Related Packages: **NONE INSTALLED**
- No `openai` (for Whisper STT)
- No `elevenlabs` (for TTS)
- No `deepgram` (for STT)
- Web Speech API requires no package (browser-native)

---

## SECTION C: Database Schema (Complete)

**Total tables after all migrations: 22**

### Table 1: `users` (Migration 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| display_name | VARCHAR(100) | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| last_login_at | TIMESTAMP | |

### Table 2: `fb_ads_today` (init.sql + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| account_name | VARCHAR(255) | |
| campaign_name | VARCHAR(255) | |
| ad_set_name | VARCHAR(255) | |
| ad_set_id | VARCHAR(255) | |
| ad_name | VARCHAR(255) | |
| spend | DECIMAL(10,2) | DEFAULT 0 |
| clicks | INTEGER | DEFAULT 0 |
| impressions | INTEGER | DEFAULT 0 |
| landing_page_views | INTEGER | DEFAULT 0 |
| synced_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(ad_set_id, ad_name) |

### Table 3: `cc_orders_today` (init.sql + 002 + 005 + 006)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | VARCHAR(255) | UNIQUE |
| offer_name | VARCHAR(255) | |
| revenue | DECIMAL(10,2) | DEFAULT 0 |
| subtotal | DECIMAL(10,2) | DEFAULT 0 |
| tax_amount | DECIMAL(10,2) | DEFAULT 0 |
| order_status | VARCHAR(50) | DEFAULT 'completed' |
| new_customer | BOOLEAN | DEFAULT false |
| conversion_time | TIMESTAMP | DEFAULT NOW() |
| utm_campaign | VARCHAR(255) | |
| utm_source | VARCHAR(255) | (006) |
| utm_medium | VARCHAR(255) | (006) |
| utm_content | VARCHAR(255) | (006) |
| utm_term | VARCHAR(255) | (006) |
| fbclid | VARCHAR(512) | |
| subscription_id | VARCHAR(255) | |
| quantity | INTEGER | DEFAULT 1 |
| is_core_sku | BOOLEAN | DEFAULT true |
| source | VARCHAR(50) | DEFAULT 'checkout_champ' |
| customer_email | VARCHAR(255) | (006) |
| user_id | INTEGER | FK → users(id) |

Indexes: `idx_cc_orders_utm`, `idx_cc_orders_user`, `idx_cc_orders_utm_source`, `idx_cc_orders_utm_medium`

### Table 4: `cc_upsells_today` (init.sql + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | VARCHAR(255) | |
| offered | BOOLEAN | DEFAULT true |
| accepted | BOOLEAN | DEFAULT false |
| offer_name | VARCHAR(255) | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(order_id, offer_name) |

### Table 5: `manual_overrides` (init.sql + 003 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| metric_key | VARCHAR(100) | NOT NULL |
| offer_name | VARCHAR(255) | NOT NULL DEFAULT 'ALL' |
| override_value | DECIMAL(10,4) | NOT NULL |
| set_by | VARCHAR(255) | |
| set_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(metric_key, offer_name) |

### Table 6: `orders_archive` (init.sql + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| archived_date | DATE | |
| order_data | JSONB | |
| archived_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 7: `fb_ads_archive` (init.sql + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| archived_date | DATE | |
| ad_data | JSONB | |
| archived_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 8: `app_settings` (init.sql + 005 + 006)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY (006) |
| key | VARCHAR(100) | NOT NULL |
| value | TEXT | NOT NULL |
| updated_by | VARCHAR(255) | DEFAULT 'system' |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(key, COALESCE(user_id, -1)) |

### Table 9: `user_preferences` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| preference_key | VARCHAR(100) | NOT NULL |
| preference_value | TEXT | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 10: `operator_conversations` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| title | VARCHAR(255) | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 11: `operator_memories` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| conversation_id | INTEGER | FK → operator_conversations(id) CASCADE |
| role | VARCHAR(20) | NOT NULL, CHECK(IN user/assistant/system) |
| content | TEXT | NOT NULL |
| metadata | JSONB | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

**NOTE:** Despite the name, `operator_memories` stores **conversation messages**, not extracted long-term memories. This is a misnomer — it functions as a messages table.

### Table 12: `automation_rules` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| trigger_type | VARCHAR(50) | NOT NULL |
| trigger_config | JSONB | NOT NULL |
| action_type | VARCHAR(50) | NOT NULL |
| action_config | JSONB | NOT NULL |
| enabled | BOOLEAN | DEFAULT true |
| created_by | VARCHAR(100) | DEFAULT 'admin' |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 13: `rule_execution_log` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| rule_id | INTEGER | FK → automation_rules(id) CASCADE |
| triggered_at | TIMESTAMP | DEFAULT NOW() |
| trigger_data | JSONB | |
| action_result | JSONB | |
| status | VARCHAR(20) | NOT NULL, CHECK(IN success/failure/skipped) |
| error_message | TEXT | |
| user_id | INTEGER | FK → users(id) |

### Table 14: `custom_categories` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| match_rules | JSONB | |
| color | VARCHAR(7) | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 15: `cost_settings` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| offer_name | VARCHAR(200) | DEFAULT 'ALL' |
| cost_type | VARCHAR(50) | NOT NULL |
| cost_value | NUMERIC(10,2) | DEFAULT 0 |
| cost_unit | VARCHAR(20) | DEFAULT 'fixed' |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(offer_name, cost_type) |

### Table 16: `saved_queries` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| sql_text | TEXT | NOT NULL |
| created_by | VARCHAR(100) | DEFAULT 'admin' |
| is_public | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 17: `notification_preferences` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| channel | VARCHAR(50) | NOT NULL |
| event_type | VARCHAR(100) | NOT NULL |
| enabled | BOOLEAN | DEFAULT true |
| config | JSONB | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |
| | | UNIQUE(user_id, channel, event_type) |

### Table 18: `user_favorites` (004 + 005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| item_type | VARCHAR(50) | NOT NULL |
| item_id | VARCHAR(200) | NOT NULL |
| label | VARCHAR(200) | |
| sort_order | INTEGER | DEFAULT 0 |
| created_at | TIMESTAMP | DEFAULT NOW() |
| user_id | INTEGER | FK → users(id) |

### Table 19: `notifications` (005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | FK → users(id) |
| type | VARCHAR(50) | NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| message | TEXT | |
| data | JSONB | |
| read_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW() |

### Table 20: `api_keys` (005)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | FK → users(id) |
| key_hash | VARCHAR(255) | NOT NULL |
| key_prefix | VARCHAR(10) | NOT NULL |
| name | VARCHAR(100) | |
| last_used_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| revoked_at | TIMESTAMP | |

### Table 21: `webhook_tokens` (006)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL FK → users(id) |
| token | VARCHAR(64) | NOT NULL UNIQUE |
| source | VARCHAR(50) | NOT NULL |
| label | VARCHAR(100) | |
| active | BOOLEAN | DEFAULT true |
| last_used_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW() |

### Table 22: `pixel_configs` (006)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | FK → users(id) |
| name | VARCHAR(100) | NOT NULL |
| funnel_page | VARCHAR(50) | NOT NULL |
| pixel_type | VARCHAR(20) | DEFAULT 'javascript' |
| enabled | BOOLEAN | DEFAULT true |
| track_pageviews | BOOLEAN | DEFAULT true |
| track_conversions | BOOLEAN | DEFAULT true |
| track_upsells | BOOLEAN | DEFAULT false |
| custom_code | TEXT | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |
| | | UNIQUE(user_id, funnel_page) |

### Expected Tables Not Present
- `team_members` — NOT CREATED (no team management feature built)

---

## SECTION D: v1 Fix Status

| # | Issue | Evidence | Status |
|---|-------|----------|--------|
| 1 | SQL fan-out (BLOCKER) | `metrics.ts:60-104` — CTEs `fb_agg` and `cc_agg` pre-aggregate both sides before LEFT JOIN. Confirmed in `core-metrics.sql:1-47` with explicit comments. | **FIXED** |
| 2 | Nginx API proxy | Client `Dockerfile` embeds nginx config routing `/api/*` → `http://server:4000`. Caddy also proxies `/api/*` → `server:4000` in production. | **FIXED** |
| 3 | Webhook HMAC rawBody | `index.ts:38-43` — `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })`. `webhook-verify.ts` uses `req.rawBody` with `crypto.timingSafeEqual()`. | **FIXED** |
| 4 | .gitignore | Exists with node_modules/, dist/, .env, .DS_Store, IDE configs. | **FIXED** |
| 5 | CORS restricted | `index.ts:28-36` — Uses `ALLOWED_ORIGIN` env var, splits comma-separated origins. Defaults to `false` (same-origin) in production. Prod docker-compose defaults to `https://optic-data.com`. | **FIXED** |
| 6 | Overrides UNIQUE constraint | Migration `003-overrides-unique-constraint.sql` — Deduplicates existing rows, adds `UNIQUE(metric_key, offer_name)` constraint. `metrics.ts:182-208` uses ON CONFLICT upsert. | **FIXED** |
| 7 | LP CTR | `fb_ads_today` has `landing_page_views INTEGER DEFAULT 0`. Facebook sync extracts `landing_page_view` action. Core query calculates `lp_ctr = landing_page_views::FLOAT / impressions`. | **FIXED** |
| 8 | Resize listener | `sidebarStore.ts` uses Zustand with `collapsed`/`mobileOpen` states. `Sidebar.tsx` uses Tailwind responsive breakpoints (`lg:`) instead of raw JS resize listener. Mobile drawer with backdrop overlay. | **FIXED** |
| 9 | Rate limiting | `express-rate-limit` v8.2.1 installed. `index.ts:47-63` — Three tiers: API (120/min), webhooks (300/min), auth (15/15min). Applied before routes at lines 66-68. | **FIXED** |
| 10 | Extended metrics in CSV | `export.ts` includes take_rate_1/3/5, subscription_pct, sub_take_rate_1/3/5, upsell_take_rate, upsell_decline_rate in CSV output with csvSafe() sanitization. | **FIXED** |
| 11 | Override original value | `metrics.ts:191-208` — `_overrides` object stores `{ original, override, set_by, set_at }` for each overridden metric. `MetricsTable.tsx` shows `*` indicator with override data. | **FIXED** |
| 12 | Touch targets ≥44px | `MobileCard.tsx` uses `px-4 py-3` (48px effective height). Buttons use `px-5 py-3`. Sidebar nav items have adequate padding. Most interactive elements meet ≥44px. | **FIXED** |
| 13 | DB port not exposed | `docker-compose.yml` — db service has `volumes:` and `healthcheck:` but **no** `ports:` mapping. Only accessible via Docker internal network. | **FIXED** |
| 14 | PWA icons | `public/icon-192.png` and `public/icon-512.png` exist as real files. `manifest.json` references both with `purpose: "any maskable"`. | **FIXED** |
| 15 | Loading skeleton | Mixed. `useMetrics.ts` has `loading`/`refreshing` states. Many pages use `animate-pulse` (Tailwind shimmer). Some pages still show plain "Loading..." text. `LoadingSpinner.tsx` is just text. | **PARTIAL** |
| 16 | Build artifacts removed | `.gitignore` includes `dist/`, `server/dist/`, `client/dist/`, `*.js.map`. No dist directories tracked in git. | **FIXED** |
| 17 | Bounce rate documented | `README.md:141` — "Bounce Rate: Requires Google Analytics integration. Not available in this dashboard." Plus LP CTR limitation documented. | **FIXED** |

### Fix Score: 16/17 (one partial)

---

## SECTION E: Route Map

### All Defined Frontend Routes (26 total)

| # | Route | Page Component | Status |
|---|-------|---------------|--------|
| 1 | `/` | Redirect → `/summary` | Functional |
| 2 | `/summary` | SummaryDashboard.tsx | **REAL** — KPIs, charts, activity feed |
| 3 | `/operator` | OperatorPage.tsx | **REAL** — AI chat with streaming |
| 4 | `/rules` | RulesEnginePage.tsx | **REAL** — Rule builder, toggle, logs |
| 5 | `/acquisition/attribution` | AttributionDashboard.tsx | **REAL** — Full metrics table, 18+ columns |
| 6 | `/acquisition/source-medium` | SourceMediumPage.tsx | **REAL** — UTM breakdown, pie/bar charts |
| 7 | `/website/performance` | WebsitePerformancePage.tsx | **REAL** — CTR/CPC/CPM, dual-axis chart |
| 8 | `/website/funnel` | WebsiteFunnelPage.tsx | **REAL** — 6-step funnel visualization |
| 9 | `/website/search` | SiteSearchPage.tsx | **REAL** — Search with bookmarks |
| 10 | `/customers/segments` | CustomerSegmentsPage.tsx | **REAL** — Acquisition/subscription segments |
| 11 | `/customers/cohorts` | CohortAnalysisPage.tsx | **REAL** — Retention heatmap |
| 12 | `/customers/ltv` | LTVAnalysisPage.tsx | **REAL** — LTV modeling, CAC ratios |
| 13 | `/discovery/social` | SocialMonitoringPage.tsx | **REAL** — Campaign breakdown |
| 14 | `/discovery/ai-visibility` | AIVisibilityPage.tsx | **REAL** — Auto-categorization |
| 15 | `/discovery/keywords` | KeywordIntelligencePage.tsx | **REAL** — Keyword extraction, word cloud |
| 16 | `/data/integrations` | IntegrationsPage.tsx | **REAL** — Connection status overview |
| 17 | `/data/sql-builder` | SQLBuilderPage.tsx | **REAL** — SQL editor with schema browser |
| 18 | `/data/api-keys` | APIKeysPage.tsx | **REAL** — Key generation/revocation |
| 19 | `/data/upload` | DataUploadPage.tsx | **REAL** — CSV import with validation |
| 20 | `/settings/connections` | ConnectionsPage.tsx | **REAL** — FB/CC/Shopify config |
| 21 | `/settings/overrides` | OverridesPage.tsx | **REAL** — Manual metric overrides |
| 22 | `/settings/general` | GeneralSettingsPage.tsx | **REAL** — Auth token, sync interval |
| 23 | `/settings/costs` | CostSettingsPage.tsx | **REAL** — COGS/shipping/handling |
| 24 | `/settings/notifications` | NotificationsPage.tsx | **REAL** — Alert prefs + history |
| 25 | `/settings/tracking` | TrackingSettingsPage.tsx | **REAL** — UTM mapping, attribution, pixels |
| 26 | `/settings/account` | AccountPage.tsx | **REAL** — Profile, password change |

### ALL 26 routes are REAL, FUNCTIONAL pages. ZERO placeholders.

### Lazy Loading: YES — All pages use `React.lazy()` with `<Suspense fallback={<LoadingSpinner />}>`.

### 404/Catch-all: NOT PRESENT — No wildcard route defined.

### Routes Expected But Missing

| Expected Route | Status | Notes |
|----------------|--------|-------|
| `/acquisition/post-purchase` | MISSING | Not built |
| `/creative` | MISSING | Not built |
| `/settings/team` | MISSING | No team management |
| `/settings/reports` | MISSING | Not built |
| `/settings/categories` | MISSING | Table exists, no UI |
| `/settings/traffic-rules` | MISSING | Not built |
| `/settings/brand-vault` | MISSING | Not built |
| `/settings/memories` | MISSING | No memories management UI |
| `/settings/global-filters` | MISSING | Not built |

---

## SECTION F: Sprint 1 Status — Navigation & Dashboards

### Sidebar Navigation
- **Location:** `components/layout/Sidebar.tsx`
- **Items:** 9 top-level sections with expandable sub-navigation
  - Operator (single link)
  - Summary (single link)
  - Marketing Acquisition → Attribution, Source/Medium
  - Website Conversion → Performance, Funnel, Site Search
  - Customer Retention → Segments, Cohorts, LTV Analysis
  - Discovery → Social Monitoring, AI Visibility, Keyword Intel
  - Data → Integrations, SQL Builder, API Keys, Data Upload
  - Settings → Connections, Overrides, General, Costs, Notifications, Tracking
  - Rules (single link)
- **Collapsible:** YES — Desktop toggle button shrinks to 64px icon-only mode. State persisted in localStorage via Zustand.
- **Mobile:** YES — Drawer overlay (280px) with backdrop, hamburger menu in mobile header.
- **Active route highlighting:** YES — Left border accent + icon color change on active route.
- **Additional features:** Notification bell with unread count badge, user info in footer, logout button.

### Layout Component
- **Location:** `components/layout/AppLayout.tsx`
- **Structure:** Sidebar + `<Outlet />` (React Router nested routing)
- **Mobile header:** Visible on `lg:hidden` — hamburger menu + branding
- **Command Palette:** `Cmd/Ctrl+K` overlay for quick navigation across all pages
- **Independent scroll:** Main content scrolls independently from sidebar

### Summary Dashboard (`/summary`)
- **KPI Cards:** 5 — Spend, Revenue, ROAS, Conversions, Net Profit (color-coded)
- **Charts:** 7-day spend vs revenue area chart (Recharts), metric sparklines
- **Workspace Quick Links:** 6 navigation cards to key sections
- **Activity Feed:** Dynamic alerts (revenue/spend changes, ROAS warnings)
- **Data Source:** `fetchTimeseries()` + `fetchMetrics()` — separate endpoints
- **Date Picker:** Period selector for timeseries (7d/14d/30d)
- **Previous Period Comparison:** NOT PRESENT
- **Auto-refresh:** Yes, with manual refresh button

### Attribution Dashboard (`/acquisition/attribution`)
- **Evolved from v1:** YES — Same core metrics table, now within the workspace architecture
- **Attribution Model Selector:** NOT PRESENT (no first-click/last-click toggle)
- **Live Orders Feed:** NOT PRESENT (no real-time order stream)
- **Operator Chat Panel (right side):** NOT PRESENT — Operator is a separate full page at `/operator`
- **Metric Columns:** 18+ present (spend, revenue, ROI, CPA, AOV, CTR, CPM, CPC, CVR, conversions, new %, LP CTR, 1-pack, 3-pack, 5-pack, sub %, upsell take, upsell decline)
- **Additional:** Pull-to-refresh (mobile), sortable columns, mobile card view, export button, filter dropdowns

### Workspace Pages Summary

| Route | Status | Quality |
|-------|--------|---------|
| `/acquisition/attribution` | REAL | Full metrics table with 18+ columns, overrides, mobile cards |
| `/acquisition/source-medium` | REAL | UTM breakdown with pie chart, bar chart, sortable table |
| `/website/performance` | REAL | CTR/CPC/CPM cards with sparklines, dual-axis area chart |
| `/website/funnel` | REAL | 6-step funnel with per-step conversion rates |
| `/website/search` | REAL | Full-text search, localStorage bookmarks, sortable |
| `/customers/segments` | REAL | Acquisition/subscription tabs, bar chart, segment KPIs |
| `/customers/cohorts` | REAL | Heatmap grid with color intensity, day-over-day changes |
| `/customers/ltv` | REAL | LTV modeling, CAC ratios, stacked bar charts |
| `/discovery/social` | REAL | Campaign breakdown, top/bottom performers |
| `/discovery/ai-visibility` | REAL | Auto-categorization with 7 keyword categories |
| `/discovery/keywords` | REAL | Word cloud, keyword extraction, sortable table |

**Sprint 1 Verdict:** Navigation architecture is excellent. All workspace pages are real implementations, not placeholders. Missing: attribution model selector, live orders feed, previous period comparison.

---

## SECTION G: Sprint 2 Status — Settings & Data

### Settings Pages

| Page | Route | UI Exists? | Functional? | Notes |
|------|-------|:----------:|:-----------:|-------|
| Connections | `/settings/connections` | YES | YES | FB/CC/Shopify config, test connections, webhook tokens, polling toggle |
| Overrides | `/settings/overrides` | YES | YES | Full CRUD, 17+ metric selectors, offer scope |
| General | `/settings/general` | YES | YES | Auth token, sync interval |
| Costs | `/settings/costs` | YES | YES | COGS/shipping/handling/processing, fixed or %, per-offer |
| Notifications | `/settings/notifications` | YES | YES | 4 alert types with threshold config, notification history tab |
| Tracking | `/settings/tracking` | YES | YES | UTM mapping, attribution window, pixel configs with snippet generation |
| Account | `/settings/account` | YES | YES | Display name, password change, logout |
| Team | — | NO | — | No team management built |
| Reports | — | NO | — | Not built |
| Categories | — | NO | — | Table exists (`custom_categories`), no UI |
| Traffic Rules | — | NO | — | Not built |
| Brand Vault | — | NO | — | Not built |
| Memories | — | NO | — | No memory management UI |
| Global Filters | — | NO | — | Not built |

**Settings built and functional: 7/7 that exist. 7 expected pages not built.**

### Data Section

| Page | Route | UI Exists? | Functional? | Notes |
|------|-------|:----------:|:-----------:|-------|
| Integrations | `/data/integrations` | YES | YES | FB/CC/Shopify status cards, connection state, manage buttons |
| SQL Builder | `/data/sql-builder` | YES | YES | Full SQL editor, schema browser, saved queries, CSV export |
| API Keys | `/data/api-keys` | YES | YES | Generate/revoke keys, API docs box |
| Data Upload | `/data/upload` | YES | YES | CSV drag-drop, preview, validation, templates |

**Data section: 4/4 fully functional.**

### SQL Builder Deep Check

| Feature | Present? | Evidence |
|---------|:--------:|---------|
| Schema browser | YES | `GET /api/sql/schema` → expandable table list with column types |
| Type/execute SQL | YES | Textarea with Cmd/Ctrl+Enter, `POST /api/sql/execute` |
| SELECT-only restriction | YES | `sql-builder.ts` — regex blocks INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE/GRANT/REVOKE/COPY/EXECUTE/DO; rejects multi-statement |
| Row limit | YES | 30-second statement timeout (not row limit per se) |
| SQL injection risk | LOW | Parameterized where possible; ad-hoc SQL validated via allowlist pattern; statement timeout mitigates DoS |
| Visualization output | TABLE | Results as table with columns/rows; no chart visualization |
| Save/load queries | YES | CRUD on `saved_queries` table, `GET/POST/DELETE /api/sql/saved` |
| "Build with Operator" | NO | No AI-generated SQL integration |
| Endpoint | `POST /api/sql/execute` | Auth required |

**SQL Builder Concern:** Regex-based validation could theoretically be bypassed with SQL comments (`/* INSERT */SELECT...`). The validation regex checks if the query starts with SELECT/WITH/EXPLAIN after trimming, which is a reasonable safeguard but not bulletproof. 30-second timeout is good defense-in-depth.

---

## SECTION H: Sprint 3 Status — Operator AI

### H.1 Chat Interface

- **Location:** `/operator` route → `OperatorPage.tsx` (full page, NOT sidebar panel)
- **Message Bubbles:** YES — User messages in blue (`bg-ats-accent`), assistant in bordered cards
- **Markdown Rendering:** NO — Uses `whitespace-pre-wrap` only, no markdown parser
- **Text Input:** YES — Textarea with Enter to send, Shift+Enter for newline
- **Send Button:** YES — Disabled during streaming or empty input
- **Mic Icon:** **NO** — No microphone icon present anywhere
- **Greeting:** YES — Robot emoji + "OpticData Operator" + description
- **Quick Action Buttons:** YES — 3 prompts: "Analyze my ROAS", "Which campaigns to pause?", "Summarize today"
- **Conversation Sidebar:** YES — Collapsible list with new chat button, delete buttons, active highlight
- **Live Status Badge:** YES — "Operator has access to your live metrics" with green pulse dot

### H.2 Claude API Integration

- **SDK:** `@anthropic-ai/sdk` v0.78.0 (`operator.ts:2`)
- **Model:** `claude-sonnet-4-20250514` (`operator.ts:121`)
- **System Prompt:** Static role prompt + dynamic metrics context (`operator.ts:7,122-123`)
  - Role: "OpticData Operator, an AI media buying assistant"
  - Capabilities described: analyze performance, optimize campaigns, data-driven decisions
- **Dynamic Context:** YES — `getMetricsContext()` fetches live data on every request (`operator.ts:10-55`)
  - Total Spend, Revenue, ROI, Conversions, CPA, Clicks, Impressions
  - Top 5 offers by revenue with conversion counts
- **Multi-turn:** YES — Full conversation history loaded from `operator_memories` and passed to Claude (`operator.ts:94-104`)
- **Streaming:** YES — Server-Sent Events (`operator.ts:110-152`)
  - `text` events with chunks
  - `done` event with conversationId
  - `error` events on failure
  - Client reads via `ReadableStream` with decoder

### H.3 Tool Calling

**CRITICAL FINDING: NO TOOLS ARE DEFINED.**

The Claude API call at `operator.ts:120-125` passes only `model`, `max_tokens`, `system`, and `messages`. There is **no `tools` parameter**. Claude cannot:

| Tool | Defined in Schema? | Server Execution Handler? | Status |
|------|-:------------------:|-:------------------------:|--------|
| query_metrics | NO | NO | NOT BUILT |
| create_rule | NO | NO | NOT BUILT |
| pause_adset | NO | NO | NOT BUILT |
| enable_adset | NO | NO | NOT BUILT |
| adjust_budget | NO | NO | NOT BUILT |
| send_notification | NO | NO | NOT BUILT |
| run_sql | NO | NO | NOT BUILT |

**Operator is a text-only chat with context injection. It can discuss metrics but cannot take any actions.** The tool execution loop (user → Claude tool_use → server executes → result back → final response) is **completely absent**.

### H.4 Conversation Persistence

- **Saved to DB:** YES — `operator_conversations` + `operator_memories` tables
- **Load Previous:** YES — `GET /api/operator/conversations/:id` fetches full history
- **Session/Conversation ID:** YES — `conversationId` passed in chat requests, returned in `done` event
- **Page Refresh:** Conversations persist in DB and reload from sidebar list. Active conversation reloads on selection.

### H.5 Memories (Long-term)

**NOT IMPLEMENTED AS DESIGNED.**

- `operator_memories` table exists but stores **conversation messages** (role: user/assistant/system + content), not extracted long-term memories.
- There is **no** automatic memory extraction from conversations.
- There is **no** `/settings/memories` page for viewing/toggling/deleting memories.
- Saved messages are only injected as conversation history within the same conversation, not across conversations.
- Cross-conversation knowledge transfer: **NONE**.

### H.6 Context Injection

- **Injected on every request:** YES (`operator.ts:107`)
- **Data included:** Total Spend, Total Revenue, ROI, Conversions, CPA, Clicks, Impressions, Top 5 Offers (revenue + conversions)
- **Freshness:** Real-time DB query on each chat request
- **Scope:** Today's data only (from `_today` tables)
- **Not included:** Historical trends, active rules, cost settings, notification state
- **Estimated token count:** ~200-300 tokens for context block — efficient

### H.7 Error Handling

- **Claude API down:** Error event sent on SSE stream (`operator.ts:132-136`). Client shows error in red box.
- **Tool execution fails:** N/A — no tools
- **Loading states:** YES — `streaming` state disables input, shows "..." on send button. Animated cursor pulse during streaming.
- **Client disconnect:** YES — `req.on('close')` calls `stream.abort()` (`operator.ts:155-157`)
- **No API key:** Returns 500 with "Anthropic API key not configured" (`operator.ts:70`)
- **Error in pre-headers:** Returns 500 JSON. Error post-headers: sends error event on stream.

### Sprint 3 Verdict

Operator text chat **works end-to-end** with streaming, conversation persistence, and live context injection. However, it is fundamentally a **chatbot, not an agent**. The complete absence of tool calling means Operator cannot take actions — it can only discuss data that's injected into its context. This is a significant gap from the "Jarvis" vision but provides a solid foundation.

---

## SECTION I: API Endpoint Inventory

| # | Method | Path | Auth | Handler | Notes |
|---|--------|------|:----:|---------|-------|
| 1 | GET | `/api/health` | No | index.ts | Status check |
| 2 | POST | `/api/auth/register` | No | auth.ts | Bcrypt, JWT, email validation |
| 3 | POST | `/api/auth/login` | No | auth.ts | Bcrypt compare, JWT generation |
| 4 | GET | `/api/auth/me` | JWT | auth.ts | Manual JWT verification |
| 5 | PUT | `/api/auth/me` | JWT | auth.ts | Profile/password update |
| 6 | GET | `/api/metrics` | Yes | metrics.ts | Core + extended metrics, overrides |
| 7 | GET | `/api/metrics/summary` | Yes | metrics.ts | Aggregated KPIs |
| 8 | GET | `/api/export/csv` | Yes | export.ts | CSV with formula injection prevention |
| 9 | GET | `/api/overrides` | Yes | overrides.ts | List overrides |
| 10 | POST | `/api/overrides` | Yes | overrides.ts | Create/update override |
| 11 | DELETE | `/api/overrides/:id` | Yes | overrides.ts | Delete override |
| 12 | POST | `/api/webhooks/checkout-champ` | HMAC | webhooks.ts | Legacy CC webhook |
| 13 | POST | `/api/webhooks/checkout-champ/:webhookToken` | HMAC | webhooks.ts | Token-based CC webhook |
| 14 | POST | `/api/webhooks/shopify` | HMAC | webhooks.ts | Legacy Shopify webhook |
| 15 | POST | `/api/webhooks/shopify/:webhookToken` | HMAC | webhooks.ts | Token-based Shopify webhook |
| 16 | POST | `/api/sync/facebook` | Yes | sync.ts | Manual FB sync trigger |
| 17 | GET | `/api/settings` | Yes | settings.ts | All settings (masked) |
| 18 | POST | `/api/settings` | Yes | settings.ts | Bulk update settings |
| 19 | DELETE | `/api/settings/:key` | Yes | settings.ts | Delete setting |
| 20 | POST | `/api/settings/test/facebook` | Yes | settings.ts | Test FB connection |
| 21 | POST | `/api/settings/test/checkout-champ` | Yes | settings.ts | Test CC connection |
| 22 | GET | `/api/analytics/timeseries` | Yes | analytics.ts | Historical 7d/30d/90d |
| 23 | GET | `/api/analytics/breakdown` | Yes | analytics.ts | By offer/account/campaign |
| 24 | GET | `/api/analytics/funnel` | Yes | analytics.ts | Conversion funnel |
| 25 | GET | `/api/analytics/source-medium` | Yes | analytics.ts | UTM breakdown |
| 26 | GET | `/api/costs` | Yes | costs.ts | Cost settings list |
| 27 | POST | `/api/costs` | Yes | costs.ts | Create/update cost |
| 28 | DELETE | `/api/costs/:id` | Yes | costs.ts | Delete cost |
| 29 | GET | `/api/notifications/preferences` | Yes | notifications.ts | Notification prefs |
| 30 | POST | `/api/notifications/preferences` | Yes | notifications.ts | Bulk update prefs |
| 31 | GET | `/api/notifications/unread-count` | Yes | notifications.ts | Unread count |
| 32 | GET | `/api/notifications` | Yes | notifications.ts | Recent 50 |
| 33 | POST | `/api/notifications/:id/read` | Yes | notifications.ts | Mark read |
| 34 | POST | `/api/operator/chat` | Yes | operator.ts | AI chat (SSE streaming) |
| 35 | GET | `/api/operator/conversations` | Yes | operator.ts | List conversations |
| 36 | GET | `/api/operator/conversations/:id` | Yes | operator.ts | Get with messages |
| 37 | POST | `/api/operator/conversations` | Yes | operator.ts | Create conversation |
| 38 | DELETE | `/api/operator/conversations/:id` | Yes | operator.ts | Delete conversation |
| 39 | GET | `/api/rules` | Yes | rules.ts | List rules |
| 40 | POST | `/api/rules` | Yes | rules.ts | Create rule |
| 41 | PUT | `/api/rules/:id` | Yes | rules.ts | Update rule |
| 42 | DELETE | `/api/rules/:id` | Yes | rules.ts | Delete rule (cascade) |
| 43 | GET | `/api/rules/:id/logs` | Yes | rules.ts | Execution logs (100) |
| 44 | POST | `/api/rules/:id/toggle` | Yes | rules.ts | Enable/disable |
| 45 | POST | `/api/sql/execute` | Yes | sql-builder.ts | Read-only SQL |
| 46 | GET | `/api/sql/saved` | Yes | sql-builder.ts | Saved queries |
| 47 | POST | `/api/sql/saved` | Yes | sql-builder.ts | Save query |
| 48 | DELETE | `/api/sql/saved/:id` | Yes | sql-builder.ts | Delete query |
| 49 | GET | `/api/sql/schema` | Yes | sql-builder.ts | DB schema |
| 50 | POST | `/api/upload/csv` | Yes | upload.ts | CSV import |
| 51 | GET | `/api/upload/templates` | Yes | upload.ts | CSV templates |
| 52 | GET | `/api/keys` | Yes | api-keys.ts | List API keys |
| 53 | POST | `/api/keys` | Yes | api-keys.ts | Generate key |
| 54 | DELETE | `/api/keys/:id` | Yes | api-keys.ts | Revoke key |
| 55 | GET | `/api/webhook-tokens` | Yes | webhook-tokens.ts | List tokens |
| 56 | POST | `/api/webhook-tokens` | Yes | webhook-tokens.ts | Generate token |
| 57 | DELETE | `/api/webhook-tokens/:id` | Yes | webhook-tokens.ts | Revoke token |
| 58 | GET | `/api/pixel-configs` | Yes | pixel-configs.ts | List configs |
| 59 | POST | `/api/pixel-configs` | Yes | pixel-configs.ts | Create/update |
| 60 | DELETE | `/api/pixel-configs/:id` | Yes | pixel-configs.ts | Delete config |
| 61 | GET | `/api/pixel-configs/snippet/:funnelPage` | Yes | pixel-configs.ts | Generate snippet |

**Total: 61 endpoints across 18 route files.**

---

## SECTION J: Metrics Accuracy

### Core SQL (Current)

```sql
WITH fb_agg AS (
  SELECT ad_set_name, account_name,
    SUM(spend) AS spend, SUM(clicks) AS clicks,
    SUM(impressions) AS impressions, SUM(landing_page_views) AS landing_page_views
  FROM fb_ads_today
  WHERE 1=1 AND user_id = $1
  GROUP BY ad_set_name, account_name
),
cc_agg AS (
  SELECT utm_campaign, offer_name,
    SUM(COALESCE(subtotal, revenue)) AS revenue,
    COUNT(DISTINCT order_id) AS conversions,
    COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
  FROM cc_orders_today
  WHERE order_status = 'completed' AND user_id = $1
  GROUP BY utm_campaign, offer_name
)
SELECT fb.account_name, COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
  SUM(fb.spend) AS spend,
  COALESCE(SUM(cc.revenue), 0) AS revenue,
  -- roi, cpa, aov, ctr, cpm, cpc, cvr, conversions, new_customer_pct, lp_ctr
FROM fb_agg fb
LEFT JOIN cc_agg cc ON fb.ad_set_name = cc.utm_campaign
GROUP BY fb.account_name, cc.offer_name
ORDER BY spend DESC;
```

### Trace: Multi-Ad Ad Set

**Scenario:** Ad set "Cold_Lookalike_2%" has 3 ads (Ad A: $50, Ad B: $30, Ad C: $20) and 5 orders via utm_campaign="Cold_Lookalike_2%" totaling $500 revenue.

1. `fb_agg` pre-aggregates: one row → spend=$100, clicks=sum, impressions=sum
2. `cc_agg` pre-aggregates: one row per (utm_campaign, offer_name) → revenue=$500, conversions=5
3. JOIN: 1 fb_agg row joins to 1 (or few) cc_agg rows

**Result:**
- Spend = $100 (correct — aggregated before join)
- Revenue = $500 (correct — aggregated before join)
- ROI = 5.0 (correct)
- CPA = $20 (correct)
- new_customer_pct ≤ 100% (correct — ratio of distinct counts)

### Verdict: **CORRECT**

The CTE pattern prevents the fan-out bug that was the BLOCKER in v1. Spend and revenue are not inflated. Summary queries use independent subqueries (no join at all), confirming they match.

**Remaining concern:** The JOIN condition `ad_set_name = utm_campaign` assumes these values match. If a user's UTM tagging doesn't use ad set names, conversions will be "Unattributed". This is a data-modeling assumption, not a bug.

---

## SECTION K: Security & Production Health

### Security Quick-Check

| Check | Status | Evidence |
|-------|:------:|---------|
| HTTPS enforced | **PASS** | Caddy auto-provisions Let's Encrypt certs. www redirects to https. |
| CORS restricted | **PASS** | `index.ts:28-36` — ALLOWED_ORIGIN, same-origin default in prod |
| Auth on protected routes | **PASS** | `index.ts:82` — `authMiddleware` applied to all `/api` except health/auth/webhooks |
| Rate limiting active | **PASS** | 3 tiers: API 120/min, webhooks 300/min, auth 15/15min |
| SQL Builder SELECT-only | **PASS** | Regex allowlist + forbidden keyword blocklist + 30s timeout |
| Operator chat requires auth | **PASS** | Mounted after `authMiddleware` at `index.ts:93` |
| No hardcoded secrets | **WARN** | Default JWT secret in `auth.ts`: `'opticdata-jwt-secret-change-in-production'`. Must be overridden via env var. |
| Webhook HMAC functional | **PASS** | rawBody + timingSafeEqual + user-scoped secrets |
| DB not publicly accessible | **PASS** | No ports mapping in docker-compose |
| Webhook tokens hashed | **FAIL** | Tokens stored in plaintext in `webhook_tokens` table |
| Pixel snippet injection | **WARN** | `pixel-configs.ts` uses `req.headers.origin` in snippet — potential header injection |

### Production Health

| Check | Status | Evidence |
|-------|:------:|---------|
| Cold-start works | **PASS** | docker-compose with health checks, init.sql auto-runs |
| FB sync cron | **PASS** | Every 10 min via `scheduler.ts`, multi-user support |
| Daily reset cron | **PASS** | Midnight UTC, archives → truncates |
| CC polling cron | **PASS** | Every minute, per-user with setting toggle |
| Persistent DB volume | **PASS** | Named volume `pgdata` in docker-compose |
| Error logging | **PARTIAL** | console.error throughout, no structured logging or log aggregation |
| Health check endpoint | **PASS** | `GET /api/health` returns `{ status: 'ok', timestamp }` |
| Graceful shutdown | **PASS** | SIGTERM/SIGINT handlers with 10s timeout |
| Auto-deploy | **PASS** | GitHub webhook → Caddy → listener → deploy.sh |

---

## SECTION L: Sprint 4 Readiness (Voice)

### What Exists

| Prerequisite | Status | Evidence |
|-------------|:------:|---------|
| Operator text chat end-to-end | **YES** | Streaming SSE, conversation persistence, context injection |
| Mic icon in UI | **NO** | No microphone icon in OperatorPage.tsx |
| Web Speech API code | **NO** | No `SpeechRecognition` or `webkitSpeechRecognition` in client |
| `/api/operator/voice` endpoint | **NO** | No voice endpoint in server |
| MediaRecorder API code | **NO** | No audio recording code |
| SpeechSynthesis API code | **NO** | No TTS code |
| OpenAI SDK (Whisper) | **NO** | Not in server package.json |
| ElevenLabs SDK | **NO** | Not installed |
| Deepgram SDK | **NO** | Not installed |

### What's Missing for Tier 1 Voice (Browser Web Speech API)

**Minimum viable path — client-side only, no new server code:**

1. **Client: Add mic button** to OperatorPage.tsx input area (~20 lines)
2. **Client: Add SpeechRecognition handler** — `webkitSpeechRecognition` API for speech-to-text (~40 lines)
3. **Client: Feed transcript into existing `sendMessage()`** — Already works, just pipe the recognized text
4. **Client: Add SpeechSynthesis for TTS** — `window.speechSynthesis.speak()` on assistant response completion (~15 lines)

**Estimated new code: ~80-100 lines of client JavaScript. Zero server changes.**

### Blockers

- **NONE for Tier 1.** The text chat pipeline is complete. Voice is purely additive UI.
- **For Tier 2 (Whisper + ElevenLabs):** Need `openai` npm package on server, audio upload endpoint, ElevenLabs API integration. Significantly more work.

### Critical Note

Tool calling is **not** implemented. Even with voice, Operator can only chat about metrics — it cannot take actions (pause ads, create rules, adjust budgets). If Sprint 4 scope includes "voice commands that do things," tool calling must be built first.

---

## SECTION M: Sprint 5 Readiness (Rules Engine)

### What Exists

| Component | Status | Evidence |
|-----------|:------:|---------|
| `automation_rules` table | **YES** | Migration 004 — name, trigger_type/config, action_type/config, enabled |
| `rule_execution_log` table | **YES** | Migration 004 — rule_id, trigger_data, action_result, status |
| CRUD API for rules | **YES** | `routes/rules.ts` — 6 endpoints (list, create, update, delete, logs, toggle) |
| `/rules` frontend route | **YES** | `RulesEnginePage.tsx` — Full rule builder UI |
| Rule builder UI | **YES** | Metric + operator + threshold → action type + config |
| Rules evaluation engine | **YES** | `services/rules-engine.ts` — `evaluateRules()` function |
| Evaluation in cron cycle | **YES** | `scheduler.ts` — calls `evaluateRules(userId)` after every FB sync and CC poll |
| FB API WRITE calls | **NO** | `facebook-sync.ts` is READ-ONLY (GET insights only) |
| Slack webhook integration | **PARTIAL** | `rules-engine.ts:executeAction()` — `webhook` action type does fire-and-forget POST to any URL (could be Slack webhook) |
| Twilio/SMS code | **NO** | Not present |
| Operator `create_rule` tool | **NO** | No tools defined in Operator |

### Current Rule Engine Capabilities

**Trigger types implemented:**
- `metric_threshold` — single metric comparison (>, <, >=, <=, =)

**Action types implemented:**
- `notification` — creates in-app notification
- `webhook` — fires POST to configured URL (fire-and-forget, no retry)
- `flag_review` — creates review flag notification

### What's Missing

1. **FB API write capability** — Need FB Marketing API calls for `pause_adset`, `enable_adset`, `adjust_budget`. Requires `ads_management` permission on FB System User (currently only `ads_read`).
2. **Slack integration** — The webhook action can POST to a Slack incoming webhook URL already. But there's no dedicated Slack setup UI or message formatting.
3. **Complex conditions** — No AND/OR logic, no multi-metric conditions, no time-based triggers.
4. **Rule cooldowns** — No rate limiting on rule execution (could fire every sync cycle).
5. **Retry logic** — Webhook action is fire-and-forget with no error handling.
6. **Rule templates** — No pre-built rule templates.

### Minimum Path: Basic Rule (CPA > X → Slack Alert)

This **already works today** with existing code:

1. User creates a Slack incoming webhook URL in their Slack workspace
2. User goes to `/rules` → creates rule:
   - Trigger: `metric_threshold`, metric: `cpa`, operator: `>`, value: `50`
   - Action: `webhook`, URL: `https://hooks.slack.com/services/...`
3. Every 10 minutes (FB sync cycle), `evaluateRules()` checks CPA
4. If CPA > $50, fires POST to Slack webhook URL with metrics payload

**This is functional today.** The payload format may not be ideal for Slack (raw JSON, not Slack Block Kit), but the pipeline works.

### For Full Rules Engine

| Task | Effort |
|------|--------|
| Add Slack Block Kit message formatting | Small |
| Add rule cooldown/deduplication | Small |
| Add FB API write calls (pause/enable/budget) | Medium — needs FB permission upgrade |
| Add complex conditions (AND/OR) | Medium |
| Add time-based triggers | Medium |
| Add email action via SMTP/SES | Medium |
| Add retry logic for webhook failures | Small |
| Connect to Operator tools | Large — requires full tool calling implementation |

---

## SECTION N: New Issues Found

### CRITICAL

| # | Severity | File | Issue |
|---|----------|------|-------|
| N1 | **CRITICAL** | `operator.ts:120-125` | **No tool calling in Operator.** Claude API call has no `tools` parameter. Operator cannot take actions — only chat about pre-injected metrics. Blocks Sprint 4 voice commands and Sprint 5 Operator-created rules. |
| N2 | **HIGH** | `operator.ts:7` | **Operator has no cross-conversation memory.** Each conversation starts fresh. No long-term memory extraction or injection. The `operator_memories` table is actually a messages table. |
| N3 | **HIGH** | `auth.ts` (routes) | **Default JWT secret is weak.** `'opticdata-jwt-secret-change-in-production'` — if `JWT_SECRET` env var is not set, this default is easily guessable. Should fail startup if not configured. |

### MEDIUM

| # | Severity | File | Issue |
|---|----------|------|-------|
| N4 | MEDIUM | `webhook-tokens.ts` | **Webhook tokens stored in plaintext.** Should be hashed (SHA256 at minimum) like API keys are. DB compromise = all webhook tokens compromised. |
| N5 | MEDIUM | `pixel-configs.ts` | **Header injection in pixel snippet.** Uses `req.headers.origin || req.headers.host` directly in generated snippet HTML. Attacker-controlled headers could inject script. |
| N6 | MEDIUM | `sql-builder.ts` | **SQL validation bypassable with comments.** Regex checks if query starts with SELECT/WITH/EXPLAIN, but `/* comment */SELECT` or creative formatting could bypass. Consider using a SQL parser. |
| N7 | MEDIUM | `App.tsx` / routes | **No 404 catch-all route.** Navigating to undefined paths shows blank page instead of "Not Found". |
| N8 | MEDIUM | `OperatorPage.tsx:363` | **No markdown rendering.** Claude responses are displayed with `whitespace-pre-wrap` only. Code blocks, headers, lists, bold/italic all render as plain text. |
| N9 | MEDIUM | `scheduler.ts` | **No distributed locking.** Cron jobs assume single-instance deployment. Multiple server instances would duplicate all sync/eval work. |
| N10 | MEDIUM | `rules-engine.ts` | **Webhook action is fire-and-forget.** No error handling, no retry, no timeout. Failed webhooks silently disappear. |

### LOW

| # | Severity | File | Issue |
|---|----------|------|-------|
| N11 | LOW | `cc-polling.ts` | **In-memory poll tracking.** `lastPollTimes` Map resets on server restart, causing potential duplicate processing window. |
| N12 | LOW | `OperatorPage.tsx` | **No abort button during streaming.** User cannot cancel a long Claude response once streaming starts (AbortController exists but no UI button). |
| N13 | LOW | `extended-metrics.sql` | **No user_id filtering in SQL file.** The file versions lack user_id filters (the inline queries in `metrics.ts` have them, but the `.sql` files don't — they appear to be reference copies). |
| N14 | LOW | `README.md` | **README is outdated.** Documents only original v1 endpoints. Missing: auth system, operator, rules, SQL builder, analytics, settings, and all Sprint 1-3 features. |

---

## SECTION O: Overall Grades

| Category | v1 Grade | Current Grade | Notes |
|----------|:--------:|:-------------:|-------|
| Database & Schema | B+ | **A** | 22 tables, comprehensive migrations, multi-user support, proper constraints/indexes |
| API & Server | C | **A-** | 61 endpoints, 18 route files, 3-tier rate limiting, auth middleware, user scoping throughout |
| Metrics Accuracy | F | **A** | CTE pattern eliminates fan-out. Verified correct with multi-ad trace. |
| Frontend & UX | A- | **A** | 26 real pages (zero placeholders), dark theme, responsive, charts, tables, modals |
| Navigation & Routing | N/A | **A** | React Router v7, lazy loading, collapsible sidebar, mobile drawer, command palette |
| Settings & Config | N/A | **A-** | 7 functional settings pages, connection testing, pixel snippet generation. Missing: team, categories, memories. |
| SQL Builder | N/A | **A-** | Full editor, schema browser, saved queries, CSV export. Missing: visualization, AI generation. |
| Operator AI (Text) | N/A | **B-** | Chat works with streaming + context. But: no tools, no memories, no markdown, no actions. Fundamentally a chatbot, not an agent. |
| Mobile Readiness | B+ | **A-** | Responsive throughout, mobile drawer, card views, touch targets, pull-to-refresh |
| PWA | B | **A-** | Real icons, manifest, service worker with cache strategies, installable |
| Auth & Security | C- | **B+** | JWT + bcrypt + API keys + HMAC webhooks + rate limiting. Weak: default JWT secret, plaintext webhook tokens. |
| DevOps & Deployment | C+ | **A-** | Docker multi-stage, Caddy HTTPS, auto-deploy webhook, graceful shutdown, health checks |
| Code Quality | B | **A-** | TypeScript throughout, consistent patterns, parameterized queries, proper error handling |
| Documentation | A- | **C+** | README outdated (v1 only). No Sprint 1-3 docs. Known limitations section is good. |
| **Voice Readiness** | N/A | **B+** | Text chat foundation is solid. Tier 1 voice (Web Speech API) requires ~100 lines client code. No blockers. |
| **Rules Engine Readiness** | N/A | **A-** | Tables, API, UI, evaluation engine, cron integration ALL exist. Basic CPA→Slack alert works TODAY. Missing: FB write, complex conditions, retries. |
| **OVERALL** | **C** | **B+** | Massive improvement across every dimension. 61 endpoints, 26 pages, 22 tables, streaming AI. Primary gap: Operator is a chatbot not an agent (no tools). |

---

## Executive Summary

### What Changed Since v1
- **16/17 v1 issues fixed** (fan-out BLOCKER resolved)
- **Full workspace architecture** with 26 real pages (zero placeholders)
- **Multi-user auth system** (JWT + bcrypt + API keys)
- **Operator AI** with Claude Sonnet streaming and live metrics context
- **Rules engine** with evaluation loop integrated into sync cron
- **SQL Builder** with schema browser and safety restrictions
- **61 API endpoints** (up from ~10 in v1)
- **22 database tables** (up from 6 in v1)

### What Works Well
1. Metrics accuracy is now correct (CTE pattern)
2. Navigation and UX are production-quality
3. Settings pages are comprehensive and functional
4. Rules engine foundation is solid and partially working
5. Auto-deploy pipeline works end-to-end
6. Multi-user data isolation throughout

### Critical Gaps for Sprint 4-5
1. **Operator has no tool calling** — Cannot take actions, only chat
2. **No cross-conversation memory** — Each conversation starts fresh
3. **No markdown rendering** in Operator responses
4. **No 404 route** — blank page on unknown URLs
5. **README is 3 sprints behind** — documents v1 only

### Sprint 4 (Voice) — Ready to Start
- Tier 1 (browser Speech API): **~100 lines of client code, zero server changes**
- Tier 2 (Whisper + ElevenLabs): Need server packages + endpoints
- **Blocker if Sprint 4 includes voice commands:** Tool calling must be built first

### Sprint 5 (Rules Engine) — Foundation Exists
- Basic alert rules (CPA > X → Slack webhook) **work today**
- FB ad management actions need Marketing API write permission
- Complex conditions and retry logic need implementation
