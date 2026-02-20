# AUDIT REPORT v5: Full System Verification + GA4 Integration + Onboarding Flow

**Date:** 2026-02-20
**Auditor:** Claude Opus 4.6
**Previous Audit:** v4 — Grade A-
**Scope:** Phase 7 verification, onboarding flow, GA4 assessment, complete system inventory

---

## SECTION A: System Inventory

### A.1 File Count

**Total Files: 149** (excluding node_modules, .git, dist)

| Category | Count |
|----------|-------|
| Root/Config | 4 |
| Audit Reports (v1-v4) | 4 |
| Deploy Scripts & Config | 7 |
| Database (init + migrations) | 9 |
| Client Config | 9 |
| Client Public Assets | 9 |
| Client Source (components, pages, hooks, etc.) | 80+ |
| Server Config | 4 |
| Server Source (routes, services, middleware) | 35+ |

### A.2 Dependencies

#### Server Dependencies (9 runtime + 10 dev)

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.78.0 | Claude AI for Operator |
| `@slack/bolt` | ^4.6.0 | Slack bot framework |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `cors` | ^2.8.5 | CORS middleware |
| `express` | ^4.18.2 | HTTP framework |
| `express-rate-limit` | ^8.2.1 | Rate limiting |
| `jsonwebtoken` | ^9.0.3 | JWT auth |
| `node-cron` | ^3.0.3 | Scheduled tasks |
| `pg` | ^8.12.0 | PostgreSQL client |
| `ws` | ^8.19.0 | WebSocket server |

| DevDep | Version |
|--------|---------|
| `@types/bcryptjs` | ^2.4.6 |
| `@types/ws` | ^8.18.1 |
| `@types/cors` | ^2.8.17 |
| `@types/express` | ^4.17.21 |
| `@types/jsonwebtoken` | ^9.0.10 |
| `@types/node` | ^20.11.5 |
| `@types/node-cron` | ^3.0.11 |
| `@types/pg` | ^8.10.9 |
| `tsx` | ^4.7.0 |
| `typescript` | ^5.3.3 |

#### Client Dependencies (9 runtime + 8 dev)

| Package | Version | Purpose |
|---------|---------|---------|
| `lucide-react` | ^0.575.0 | Icons |
| `react` | ^18.2.0 | UI framework |
| `react-dom` | ^18.2.0 | DOM renderer |
| `react-hot-toast` | ^2.6.0 | Toast notifications |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `react-router-dom` | ^7.13.0 | Client routing |
| `recharts` | ^3.7.0 | Charts |
| `remark-gfm` | ^4.0.1 | GFM markdown |
| `zustand` | ^5.0.11 | State management |

#### Dependency Checks

| Check | Status | Evidence |
|-------|:------:|---------|
| `@slack/bolt` NOT in client/package.json | ✅ PASS | Only in server/package.json |
| `@types/ws` in server devDependencies | ✅ PASS | ^8.18.1 in devDependencies |

### A.3 Database Schema

**Total Tables: 24** (23 from init+migrations + pixel_events from 007)

| # | Table | Columns | Purpose |
|---|-------|---------|---------|
| 1 | `fb_ads_today` | 12 | Facebook Ads daily snapshot |
| 2 | `cc_orders_today` | 21 | CheckoutChamp/Shopify orders (daily) |
| 3 | `cc_upsells_today` | 7 | Upsell tracking |
| 4 | `manual_overrides` | 6 | Manual metric corrections |
| 5 | `orders_archive` | 5 | Historical order archive (JSONB) |
| 6 | `fb_ads_archive` | 5 | Historical ads archive (JSONB) |
| 7 | `app_settings` | 5 | Key-value configuration |
| 8 | `user_preferences` | 5 | User UI preferences |
| 9 | `operator_conversations` | 5 | AI chat sessions |
| 10 | `operator_memories` | 6 | Chat messages within conversations |
| 11 | `operator_long_term_memory` | 5 | Extracted facts for AI context |
| 12 | `automation_rules` | 13 | Rules engine definitions |
| 13 | `rule_execution_log` | 8 | Rule execution audit trail |
| 14 | `custom_categories` | 6 | Campaign grouping |
| 15 | `cost_settings` | 8 | COGS/shipping/handling costs |
| 16 | `saved_queries` | 8 | User-saved SQL queries |
| 17 | `notification_preferences` | 9 | Alert channel configuration |
| 18 | `user_favorites` | 6 | Pinned views |
| 19 | `users` | 6 | User accounts |
| 20 | `notifications` | 8 | In-app notifications |
| 21 | `api_keys` | 7 | API key management |
| 22 | `webhook_tokens` | 8 | Webhook URL tokens |
| 23 | `pixel_configs` | 12 | Multi-pixel funnel configs |
| 24 | `pixel_events` | 10 | Pixel fire event tracking |

**Migration 008 (`008_security_fixes.sql`):** Contains NO schema changes. Only adds index `idx_webhook_tokens_token` and documents the manual rehashing procedure for existing plaintext tokens. Comments explain the SHA256 hashing approach.

---

## SECTION B: Phase 7 Verification (Block by Block)

### B.1 Block 1: Dead Code Wiring

#### LiveOrderFeed

| Check | Status | Evidence |
|-------|:------:|---------|
| Rendered on SummaryDashboard? | ✅ | `SummaryDashboard.tsx:265` — `<LiveOrderFeed />` |
| Rendered on AttributionDashboard? | ✅ | `AttributionDashboard.tsx:9` (import), `:219` (render) |
| Shows relative timestamps? | ✅ | `LiveOrderFeed.tsx:13-24` — "just now", "2m ago", etc. |
| Shows new_customer badge? | ✅ | `LiveOrderFeed.tsx:96-100` — green "NEW" badge |
| Has green pulse "Live" indicator? | ✅ | `LiveOrderFeed.tsx:61-64` — `animate-pulse` + "LIVE"/"OFFLINE" |
| Subscribes to correct WS events? | ✅ | `LiveOrderFeed.tsx:42-46` — `new_order` + `snapshot` events |

#### AnimatedNumber Spread

| Component | Uses AnimatedNumber? | Evidence |
|-----------|:---:|---------|
| SummaryDashboard KPI cards | ✅ | `SummaryDashboard.tsx:11,159,170,181,187,198` |
| SummaryCards.tsx | ✅ | `SummaryCards.tsx:3,63` |
| WebsitePerformancePage.tsx | ✅ | `WebsitePerformancePage.tsx:16` |
| SourceMediumPage.tsx | ✅ | `SourceMediumPage.tsx:15` |
| WebsiteFunnelPage.tsx | ✅ | `WebsiteFunnelPage.tsx:6` |
| MetricsTable.tsx | ❌ | Uses simple formatted values |
| MobileCard.tsx | ❌ | Uses simple formatted values |

**Verdict:** LiveOrderFeed fully wired. AnimatedNumber spread to 5 components (up from 1 in v4). MetricsTable/MobileCard still use plain values — acceptable since AnimatedNumber is best for summary KPIs, not table rows.

### B.2 Block 2: Security Fixes

#### Webhook Token Hashing (was H2)

| Check | Status | Evidence |
|-------|:------:|---------|
| Tokens hashed with SHA256 before storage? | ✅ | `webhook-tokens.ts:37` — `crypto.createHash('sha256')` |
| Token shown to user ONE TIME on creation? | ✅ | `webhook-tokens.ts:47` — raw token returned only on POST |
| Verification in webhooks.ts (hash-to-hash)? | ✅ | `webhooks.ts:13` — hashes incoming token before DB lookup |
| **Verification in webhook-verify.ts?** | ⛔ **BROKEN** | `webhook-verify.ts:15-17` — compares RAW token to stored hash! |
| Migration handles existing plaintext tokens? | ⚠️ MANUAL | `008_security_fixes.sql` — documented manual rehash procedure only |

**CRITICAL BUG:** There are TWO separate token resolution functions:
1. `webhooks.ts:resolveWebhookToken()` — **CORRECT** — hashes token before lookup (line 13)
2. `webhook-verify.ts:resolveTokenUserId()` — **BROKEN** — queries raw token against hashed column (line 15-17)

The HMAC signature verification middleware (`verifyCheckoutChamp`/`verifyShopify`) calls `resolveTokenUserId()` to find the user's webhook secret. Since this function compares the raw token to a SHA256 hash, it will **never match**, falling back to a null userId and using the global secret. This effectively **breaks per-user webhook secret isolation**.

#### Header Injection (was H1)

| Check | Status | Evidence |
|-------|:------:|---------|
| `req.headers.origin` sanitized? | ✅ | `pixel-configs.ts:90` — regex whitelist `[^a-zA-Z0-9.\-:\/]` |
| `funnelPage` param sanitized? | ✅ | `pixel-configs.ts:91` — regex whitelist `[^a-zA-Z0-9.\-_]` |
| Sanitization method? | ✅ | Character class whitelist (allowlist approach) |
| Custom code XSS risk? | ⚠️ | `pixel-configs.ts:143-144` — `custom_code` injected unsanitized |

#### Webhook Retry (was G3/M3)

| Check | Status | Evidence |
|-------|:------:|---------|
| 4xx errors NOT retried? | ✅ | `rules-engine.ts:234-237` — throws non-retry error for 400-499 |
| Only 5xx and network errors retried? | ✅ | `rules-engine.ts:239-241` — retry with exponential backoff |
| Per-request timeout? | ✅ | `rules-engine.ts:209-211` — 10-second AbortController timeout |

#### Budget Minimum (was G2/L3)

| Check | Status | Evidence |
|-------|:------:|---------|
| Minimum $1/day (100 cents) enforced? | ✅ | `meta-api.ts:48` — `if (budgetCents < 100) throw new Error(...)` |

### B.3 Block 3: New Pages

#### `/settings/memories`

| Check | Status | Evidence |
|-------|:------:|---------|
| Route exists? | ✅ | `App.tsx` route for `/settings/memories` |
| Page lists all memories? | ✅ | `MemoriesPage.tsx` — grid layout with memory cards |
| Each memory has delete button? | ✅ | Delete button per card |
| "Clear All" button with confirmation? | ⚠️ PARTIAL | **DELETE /api/operator/memories (bulk) NOT implemented** |
| `GET /api/operator/memories` endpoint? | ✅ | `operator.ts:498-513` |
| `DELETE /api/operator/memories/:id` endpoint? | ✅ | `operator.ts:516-533` |
| `DELETE /api/operator/memories` (clear all)? | ❌ MISSING | Only individual deletion exists |
| In sidebar nav under Settings? | ✅ | Listed in `routes.ts` NAV_SECTIONS |

#### `/settings/widget` (note: route is `/settings/widget`, not `/data/widget`)

| Check | Status | Evidence |
|-------|:------:|---------|
| Route exists? | ✅ | `App.tsx` route for `/settings/widget` |
| API key selector dropdown? | ✅ | `WidgetConfigPage.tsx:220-293` |
| Metric selector (toggle buttons)? | ✅ | `WidgetConfigPage.tsx:144-168` — checkboxes for 5 metrics |
| Theme selector (dark/light)? | ✅ | `WidgetConfigPage.tsx:124-142` |
| Position selector? | ✅ | `WidgetConfigPage.tsx:170-190` — bottom-right/left/inline |
| Live snippet preview that updates? | ✅ | `WidgetConfigPage.tsx:318-445` — `WidgetPreview` component |
| Copy button? | ✅ | `WidgetConfigPage.tsx:300-306` |
| In sidebar nav under Settings? | ✅ | Listed in `routes.ts` NAV_SECTIONS |

#### Widget JS Upgrades

| Check | Status | Evidence |
|-------|:------:|---------|
| `data-metrics` attribute works? | ✅ | `widget.js:10,18-25` — parses comma-separated metrics |
| `data-position` attribute works? | ✅ | `widget.js:11,53-57` — bottom-right/left/inline |
| Number animation (requestAnimationFrame)? | ⚠️ CSS | `widget.js:110-132` — uses CSS transition flash (600ms), not rAF |
| Green/red flash on value change? | ✅ | `widget.js:128-160` — green for up, red for down |
| Reconnect doesn't duplicate DOM? | ✅ | `widget.js:188-218` — container created once, WS reconnects only |

### B.4 Block 4: Operator Intelligence

#### Complete Tool Inventory (15 tools)

| # | Tool Name | Category | Schema | Handler | In Array | In Switch |
|---|-----------|----------|:------:|:-------:|:--------:|:---------:|
| 1 | `get_campaign_metrics` | Data Query | ✅ | ✅ L216 | ✅ L7 | ✅ L216 |
| 2 | `get_adset_metrics` | Data Query | ✅ | ✅ L234 | ✅ L17 | ✅ L234 |
| 3 | `get_order_stats` | Data Query | ✅ | ✅ L251 | ✅ L26 | ✅ L251 |
| 4 | `get_top_offers` | Data Query | ✅ | ✅ L270 | ✅ L35 | ✅ L270 |
| 5 | `get_roas_by_campaign` | Data Query | ✅ | ✅ L288 | ✅ L44 | ✅ L288 |
| 6 | `get_source_medium` | Data Query | ✅ | ✅ L316 | ✅ L53 | ✅ L316 |
| 7 | `pause_adset` | Meta Action | ✅ | ✅ L336 | ✅ L62 | ✅ L336 |
| 8 | `enable_adset` | Meta Action | ✅ | ✅ L348 | ✅ L73 | ✅ L348 |
| 9 | `adjust_budget` | Meta Action | ✅ | ✅ L360 | ✅ L84 | ✅ L360 |
| 10 | `run_sql` | SQL | ✅ | ✅ L373 | ✅ L96 | ✅ L373 |
| 11 | `list_rules` | Rules | ✅ | ✅ L408 | ✅ L107 | ✅ L408 |
| 12 | `create_rule` | Rules | ✅ | ✅ L420 | ✅ L116 | ✅ L420 |
| 13 | `toggle_rule` | Rules | ✅ | ✅ L435 | ✅ L143 | ✅ L435 |
| 14 | `query_historical` | Historical | ✅ | ✅ L455 | ✅ L155 | ✅ L455 |
| 15 | `send_notification` | Notification | ✅ | ✅ L496 | ✅ L168 | ✅ L496 |

All files reference: `server/src/services/operator-tools.ts`

**Confirmed: 15/15 tools present with schema + handler + array entry + switch case.**

#### System Prompt Updates

| Check | Status | Evidence |
|-------|:------:|---------|
| Active rules context injected? | ✅ | `operator.ts:77-103` — fetches rules, injects into system prompt |
| Long-term memories injected? | ✅ | `operator.ts:106-119` — fetches memories, injects into context |
| Voice response guidance present? | ✅ | `operator.ts:26` — "keep responses concise... avoid markdown tables in voice mode" |
| Tool awareness for all 15 tools? | ✅ | `operator.ts:8-26` — 8 categories covering all 15 tools |

#### Relative Budget Adjustments

| Check | Status | Evidence |
|-------|:------:|---------|
| `adjust_budget` supports `increase_percent`? | ❌ | Only `daily_budget` (absolute dollars) in schema |
| `adjust_budget` supports `decrease_percent`? | ❌ | Only `daily_budget` (absolute dollars) in schema |
| Fetches current budget before percentage calc? | ❌ | No — direct update only |
| Helper functions exist? | ✅ | `meta-api.ts:85-105` — `increaseBudget()`/`decreaseBudget()` exist but NOT exposed as tools |

**Note:** `increaseBudget()` and `decreaseBudget()` helper functions exist in `meta-api.ts` but are not wired as tool parameters or separate tools. The Operator can only set absolute budget values.

### B.5 Block 5: Slack Bot Upgrades

| Check | Status | Evidence |
|-------|:------:|---------|
| Dashboard link in slash command responses? | ✅ | `slack-bot.ts:295-298` — `dashboardLinkBlock()` appended to all responses |
| `/optic ask` uses full tool calling? | ✅ | `slack-bot.ts:894-931` — Claude Sonnet 4 + 15 tools + execution loop |
| Tool execution loop in Slack AI handler? | ✅ | `slack-bot.ts:910-927` — loops until `stop_reason !== 'tool_use'` |
| `/optic offers` command? | ✅ | `slack-bot.ts:609-611` — Page 2 of dashboard shows Offers Deep Dive |

**Complete Slack Commands:**
1. `/optic status` — Full paginated dashboard (4 pages with arrow navigation)
2. `/optic pin` — Pin live dashboard to channel
3. `/optic unpin` — Remove pinned dashboard
4. `/optic roas` — Quick ROAS check
5. `/optic spend` — Today's ad spend
6. `/optic cpa` — Cost per acquisition
7. `/optic revenue` — Revenue + P/L
8. `/optic ask <question>` — Full AI with tool calling
9. `/optic help` — Command guide

### B.6 Block 6: Previous Period Comparison

| Check | Status | Evidence |
|-------|:------:|---------|
| Server returns previous period data? | ✅ | `metrics.ts:225-286` — `/api/metrics/summary` returns `previous` object |
| Yesterday's data from archive table? | ✅ | `metrics.ts:242-256` — queries `fb_ads_archive` + `orders_archive` WHERE `archived_date = CURRENT_DATE - 1` |
| Delta percentages computed? | ✅ | `SummaryCards.tsx:9-12` — client-side `calcDelta()` function |
| Client shows delta badges on KPI cards? | ✅ | `SummaryCards.tsx:38-42` — `DeltaBadge` component with arrow + percentage |
| Green for positive, red for negative? | ✅ | `SummaryCards.tsx:31-36` — `text-green-400` / `text-red-400` |
| Spend inverted (UP = red, DOWN = green)? | ✅ | `SummaryCards.tsx:84` — `invertColors` prop on Spend card only |
| "vs yesterday" label? | ❌ | No explicit label — badge shows only arrow + percentage (e.g., "↑12.5%") |

### B.7 Block 7+8: Cleanup

| Check | Status | Evidence |
|-------|:------:|---------|
| `@slack/bolt` removed from client/package.json? | ✅ | Not present in client dependencies |
| `@types/ws` in server devDependencies? | ✅ | `^8.18.1` in devDependencies |
| 404 page has "Back to Dashboard" link? | ✅ | `App.tsx` — NotFoundPage with link to "/" → `/summary` |
| Voice auto-sends transcript in manual mic mode? | ✅ | `OperatorPage.tsx:107-118` — 500ms delay then auto-sends |

### B.8 Block 9: README

| Check | Status | Evidence |
|-------|:------:|---------|
| README updated? | ✅ | `README.md` — comprehensive rewrite |
| Documents Operator AI + 15 tools? | ✅ | Lists AI Operator with Sonnet-powered 15-tool system |
| Documents WebSocket real-time? | ✅ | Mentioned in features |
| Documents Slack bot? | ✅ | Mentioned with slash commands |
| Documents embeddable widget? | ✅ | Listed as feature |
| Documents rules engine? | ✅ | 7 action types documented |
| Documents voice? | ✅ | Wake word + STT/TTS mentioned |
| Documents all environment variables? | ✅ | In .env.example |
| Architecture diagram/description? | ✅ | Text architecture description included |

---

## SECTION C: Onboarding Flow Assessment

### C.1 New User Registration

**Flow:**
1. User visits → `AuthGate` component checks for JWT token
2. No token → `LoginPage.tsx` shown (toggles between login/register)
3. Register requires: email, password (6+ chars), optional display name
4. On success: JWT returned (7-day expiry), stored in authStore
5. Redirected to `/summary` (SummaryDashboard)

| Check | Status | Evidence |
|-------|:------:|---------|
| Registration page exists? | ✅ | `LoginPage.tsx` — toggle between login/register modes |
| Login page exists? | ✅ | Same component, toggled |
| Auth tokens stored? | ✅ | `authStore.ts` (Zustand) |
| Protected routes redirect to login? | ✅ | `AuthGate` wrapper on all routes |
| Empty state on Summary? | ⚠️ | Shows "—" placeholders and 0 values, no guidance |
| Empty state on Attribution? | ⚠️ | Empty table/cards, no help text |
| Empty state on Operator? | ⚠️ | Works but has no data to analyze |

### C.2 API Key / Webhook Configuration

#### Facebook Ads

| Step | Check | Status | Evidence |
|------|-------|:------:|---------|
| 1 | Where to enter FB Access Token? | ✅ | `ConnectionsPage.tsx:189` — Settings > Connections |
| 2 | Where to enter Ad Account IDs? | ✅ | `ConnectionsPage.tsx:194` — comma-separated input |
| 3 | Can they test connection? | ✅ | `ConnectionsPage.tsx:199` — Test button calls `testFacebookConnection()` |
| 4 | After saving, does sync start? | ✅ | Cron picks it up every 10 minutes |
| 5 | How long until data appears? | ⚠️ | Up to 10 minutes (no manual trigger from UI) |
| 6 | Error handling for invalid token? | ✅ | Test button shows error message |

#### Checkout Champ

| Step | Check | Status | Evidence |
|------|-------|:------:|---------|
| 1 | Where to get webhook URL? | ✅ | `ConnectionsPage.tsx:234` — auto-displayed with copy button |
| 2 | How to configure CC? | ⚠️ | No in-app documentation; URL shown but no setup guide |
| 3 | Token-based vs legacy? | ✅ | Both supported; token-based section below legacy |
| 4 | HMAC verification automatic? | ✅ | Secret entered in `ConnectionsPage.tsx:228` |
| 5 | Data appears immediately? | ✅ | Real-time via WebSocket on webhook receipt |
| 6 | Error handling? | ⚠️ | No webhook delivery logs visible to user |

#### Shopify

| Step | Check | Status | Evidence |
|------|-------|:------:|---------|
| 1 | Where to get webhook URL? | ✅ | `ConnectionsPage.tsx:273` — auto-displayed with copy |
| 2 | What events to subscribe to? | ❌ | Not documented in UI |
| 3 | HMAC verification setup? | ✅ | Secret field at `ConnectionsPage.tsx:267` |
| 4 | No test button | ❌ | Unlike FB and CC, Shopify has no test |

#### Slack Bot

| Step | Check | Status | Evidence |
|------|-------|:------:|---------|
| 1 | Where to enter Slack tokens? | ⚠️ | **ENV VARS ONLY** — no Settings UI |
| 2 | "Connect Slack" button in settings? | ❌ | Does not exist |
| 3 | Minimum setup? | ⚠️ | Requires SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET in .env |

#### Operator AI (Claude)

| Step | Check | Status | Evidence |
|------|-------|:------:|---------|
| 1 | Where does ANTHROPIC_API_KEY go? | ⚠️ | **ENV VAR ONLY** — not configurable in UI |
| 2 | What happens if key is missing? | ⚠️ | Operator page shows error on first message attempt |
| 3 | Is it clear user needs a key? | ❌ | No indication until they try to chat |

### C.3 Data Pipeline Verification

| Check | Status | Evidence |
|-------|:------:|---------|
| FB sync cron runs on schedule? | ✅ | `scheduler.ts:45` — `*/10 * * * *` (every 10 min) |
| FB sync populates fb_ads_today? | ✅ | `facebook-sync.ts` — ON CONFLICT upsert |
| CC webhook populates cc_orders_today? | ✅ | `webhooks.ts:30-117` — flexible field handling |
| JOIN condition documented? | ❌ **CRITICAL** | `metrics.ts:102` — `fb.ad_set_name = cc.utm_campaign` — **NOT documented anywhere** |
| Override mechanism works? | ✅ | `metrics.ts:181-227` — overlay + audit trail |
| Daily archive + reset at midnight? | ✅ | `scheduler.ts:113` — midnight UTC cron |
| Historical data preserved? | ✅ | JSONB archives in `orders_archive` + `fb_ads_archive` |

### C.4 Onboarding Gaps

| # | Gap | Severity | Description |
|---|-----|----------|-------------|
| 1 | No onboarding wizard | **HIGH** | User registers → empty dashboard, no guidance on next steps |
| 2 | UTM naming requirement undocumented | **CRITICAL** | `ad_set_name` must EXACTLY match `utm_campaign` for attribution to work. No fuzzy matching, no case-insensitive matching. Not mentioned anywhere in the UI |
| 3 | No test/demo data | **MEDIUM** | New user can't see what dashboard looks like when populated |
| 4 | No Slack configuration UI | **MEDIUM** | Slack requires env vars only — no Settings page integration |
| 5 | ANTHROPIC_API_KEY not configurable in UI | **MEDIUM** | Must be set as env var — Operator fails silently if missing |
| 6 | No webhook delivery logs | **MEDIUM** | User can't debug why webhooks aren't working |
| 7 | No Shopify test button | **LOW** | FB and CC have test buttons, Shopify doesn't |
| 8 | Settings masking confusion | **LOW** | Masked values (`****abcd`) shown in placeholder — user can't tell if configured or not |
| 9 | No "getting started" checklist | **HIGH** | No configuration checklist showing what's set up vs. missing |
| 10 | First data delay unexplained | **LOW** | FB sync runs every 10 min but no indication of when data will appear |
| 11 | Required vs. optional unclear | **MEDIUM** | Settings pages don't distinguish required from optional configurations |

**Onboarding Verdict: C+** — The system is technically capable ("throw your keys in and it works") but provides zero hand-holding for a new user. A user who already knows what they're doing can configure everything through Settings > Connections. But the **UTM naming requirement** is a showstopper — if `ad_set_name` doesn't match `utm_campaign`, all attribution data goes to "Unattributed" with no warning or explanation.

---

## SECTION D: Complete Route Inventory

**Total Routes: 29** (28 pages + 1 redirect + catch-all 404)

| # | Route | Component | Real | Notes |
|---|-------|-----------|:----:|-------|
| 1 | `/` | Redirect → `/summary` | ✅ | |
| 2 | `/summary` | SummaryDashboard | ✅ | Command center with KPIs, charts, LiveOrderFeed |
| 3 | `/operator` | OperatorPage | ✅ | AI chat with 15 tools, voice, hands-free |
| 4 | `/acquisition/attribution` | AttributionDashboard | ✅ | Campaign P&L, filtering, LiveOrderFeed |
| 5 | `/acquisition/source-medium` | SourceMediumPage | ✅ | UTM breakdown with pie charts |
| 6 | `/website/performance` | WebsitePerformancePage | ✅ | CTR, CPC, CPM metrics |
| 7 | `/website/funnel` | WebsiteFunnelPage | ✅ | Conversion funnel visualization |
| 8 | `/website/search` | SiteSearchPage | ✅ | Site search analytics |
| 9 | `/customers/segments` | CustomerSegmentsPage | ✅ | Customer segmentation |
| 10 | `/customers/cohorts` | CohortAnalysisPage | ✅ | Cohort retention |
| 11 | `/customers/ltv` | LTVAnalysisPage | ✅ | Lifetime value analysis |
| 12 | `/discovery/social` | SocialMonitoringPage | ✅ | Social media monitoring |
| 13 | `/discovery/ai-visibility` | AIVisibilityPage | ✅ | AI/SEO visibility |
| 14 | `/discovery/keywords` | KeywordIntelligencePage | ✅ | Keyword intel |
| 15 | `/data/integrations` | IntegrationsPage | ✅ | Integration management |
| 16 | `/data/sql-builder` | SQLBuilderPage | ✅ | SQL query builder |
| 17 | `/data/api-keys` | APIKeysPage | ✅ | API key management |
| 18 | `/data/upload` | DataUploadPage | ✅ | CSV upload |
| 19 | `/settings/connections` | ConnectionsPage | ✅ | FB/CC/Shopify configuration |
| 20 | `/settings/overrides` | OverridesPage | ✅ | Manual metric corrections |
| 21 | `/settings/general` | GeneralSettingsPage | ✅ | App-level settings |
| 22 | `/settings/costs` | CostSettingsPage | ✅ | COGS/shipping costs |
| 23 | `/settings/notifications` | NotificationsPage | ✅ | Alert preferences |
| 24 | `/settings/tracking` | TrackingSettingsPage | ✅ | UTM mapping, attribution, pixels |
| 25 | `/settings/account` | AccountPage | ✅ | Profile management |
| 26 | `/settings/memories` | MemoriesPage | ✅ | **NEW** — AI memory management |
| 27 | `/settings/widget` | WidgetConfigPage | ✅ | **NEW** — Widget embed config |
| 28 | `/finance/pnl` | PnLPage | ✅ | P&L analysis |
| 29 | `/rules` | RulesEnginePage | ✅ | Automation rules |
| 30 | `*` | NotFoundPage | ✅ | 404 with "Back to Dashboard" link |

All routes use lazy loading with Suspense. **28 real pages + redirect + 404 = 30 route definitions.**

---

## SECTION E: Complete API Endpoint Inventory

**Total Endpoints: 70**

### Authentication (4)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/auth/register` | No | Register |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/me` | JWT | Get profile |
| PUT | `/api/auth/me` | JWT | Update profile |

### Health (1)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/health` | No | Health check |

### Metrics (2)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/metrics` | JWT | Core metrics with filters |
| GET | `/api/metrics/summary` | JWT | Summary with previous period |

### Analytics (5)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/analytics/timeseries` | JWT | Time-series (7d/30d/90d) |
| GET | `/api/analytics/breakdown` | JWT | Offer/account/campaign breakdown |
| GET | `/api/analytics/funnel` | JWT | Conversion funnel |
| GET | `/api/analytics/source-medium` | JWT | UTM source/medium breakdown |
| GET | `/api/analytics/pnl` | JWT | P&L summary |

### Webhooks (4)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/webhooks/checkout-champ/:webhookToken` | HMAC | CC orders (token-based) |
| POST | `/api/webhooks/checkout-champ` | HMAC | CC orders (legacy) |
| POST | `/api/webhooks/shopify/:webhookToken` | HMAC | Shopify orders (token-based) |
| POST | `/api/webhooks/shopify` | HMAC | Shopify orders (legacy) |

### Sync (1)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/sync/facebook` | JWT | Trigger FB sync |

### Settings (5)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/settings` | JWT | Get all settings (masked) |
| POST | `/api/settings` | JWT | Bulk update settings |
| DELETE | `/api/settings/:key` | JWT | Delete setting |
| POST | `/api/settings/test/facebook` | JWT | Test FB connection |
| POST | `/api/settings/test/checkout-champ` | JWT | Test CC connection |

### Overrides (3)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/overrides` | JWT | List overrides |
| POST | `/api/overrides` | JWT | Create/update override |
| DELETE | `/api/overrides/:id` | JWT | Delete override |

### Rules (6)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/rules` | JWT | List rules |
| POST | `/api/rules` | JWT | Create rule |
| PUT | `/api/rules/:id` | JWT | Update rule |
| DELETE | `/api/rules/:id` | JWT | Delete rule |
| GET | `/api/rules/:id/logs` | JWT | Rule execution history |
| POST | `/api/rules/:id/toggle` | JWT | Toggle rule enabled/disabled |

### Operator (7)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/operator/chat` | JWT | AI chat (SSE streaming) |
| GET | `/api/operator/conversations` | JWT | List conversations |
| GET | `/api/operator/conversations/:id` | JWT | Get conversation |
| POST | `/api/operator/conversations` | JWT | Create conversation |
| DELETE | `/api/operator/conversations/:id` | JWT | Delete conversation |
| GET | `/api/operator/memories` | JWT | **NEW** — List memories |
| DELETE | `/api/operator/memories/:id` | JWT | **NEW** — Delete memory |

### Notifications (5)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/notifications/preferences` | JWT | Get preferences |
| POST | `/api/notifications/preferences` | JWT | Update preferences |
| GET | `/api/notifications/unread-count` | JWT | Unread count |
| GET | `/api/notifications` | JWT | List recent (50) |
| POST | `/api/notifications/:id/read` | JWT | Mark as read |

### Export (1)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/export/csv` | JWT | Export CSV |

### Costs (3)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/costs` | JWT | List costs |
| POST | `/api/costs` | JWT | Create/update cost |
| DELETE | `/api/costs/:id` | JWT | Delete cost |

### SQL Builder (5)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/sql/execute` | JWT | Execute read-only SQL |
| GET | `/api/sql/saved` | JWT | List saved queries |
| POST | `/api/sql/saved` | JWT | Save query |
| DELETE | `/api/sql/saved/:id` | JWT | Delete saved query |
| GET | `/api/sql/schema` | JWT | Database schema info |

### Upload (2)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| POST | `/api/upload/csv` | JWT | Import CSV |
| GET | `/api/upload/templates` | JWT | CSV templates |

### API Keys (3)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/keys` | JWT | List keys (prefix only) |
| POST | `/api/keys` | JWT | Generate key |
| DELETE | `/api/keys/:id` | JWT | Revoke key |

### Webhook Tokens (3)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/webhook-tokens` | JWT | List tokens |
| POST | `/api/webhook-tokens` | JWT | Generate token |
| DELETE | `/api/webhook-tokens/:id` | JWT | Revoke token |

### Pixel Configs (5)
| Method | Path | Auth | Purpose |
|--------|------|:----:|---------|
| GET | `/api/pixel-configs` | JWT | List configs |
| POST | `/api/pixel-configs` | JWT | Create/update |
| DELETE | `/api/pixel-configs/:id` | JWT | Delete config |
| GET | `/api/pixel-configs/snippet/:funnelPage` | JWT | Generate snippet |
| POST | `/api/pixel-configs/event` | Mixed | Record pixel event |

### WebSocket (1)
| Protocol | Path | Auth | Purpose |
|----------|------|:----:|---------|
| WS | `/ws` | JWT/API Key | Real-time updates |

---

## SECTION F: Security Audit

### F.1 Authentication & Authorization

| Check | Status | Evidence |
|-------|:------:|---------|
| All protected routes require JWT? | ✅ | `index.ts` — `authMiddleware` on all `/api/*` except auth, health, webhooks |
| JWT secret fails startup if missing? | ✅ | `auth.ts:8` — throws if `JWT_SECRET` not set |
| Password hashing (bcrypt)? | ✅ | `auth.ts:51` — bcryptjs with 12 rounds |
| API keys hashed (SHA256)? | ✅ | `api-keys.ts:38` — hash before storage, `timingSafeEqual` for comparison |
| Webhook tokens hashed (SHA256)? | ⚠️ | Stored hashed ✅, but `webhook-verify.ts` lookup is broken (see B.2) |
| Rate limiting on all HTTP endpoints? | ✅ | 120/min API, 300/min webhooks, 15/15min auth |
| CORS restricted? | ⚠️ | Production: same-origin. **Dev: `origin: true` with `credentials: true`** — dangerous |

### F.2 Input Validation & Injection

| Check | Status | Evidence |
|-------|:------:|---------|
| SQL Builder: SELECT-only + comment stripping? | ✅ | `sql-builder.ts:6-48` — whitelist + forbidden keywords + timeout |
| Operator run_sql: same restrictions? | ✅ | `operator-tools.ts:373-405` — identical validation |
| Pixel snippet: header injection fixed? | ✅ | `pixel-configs.ts:90-91` — regex whitelist sanitization |
| Webhook payloads validated? | ✅ | HMAC signature verification on all webhook routes |
| CSV upload: formula injection prevention? | ❌ **VULN** | `upload.ts:60-150` — no sanitization of `=`, `+`, `-`, `@` prefixes |
| API key generation: crypto.randomBytes? | ✅ | `api-keys.ts:37` — `crypto.randomBytes(32)` |

### F.3 Infrastructure

| Check | Status | Evidence |
|-------|:------:|---------|
| HTTPS enforced (Caddy)? | ✅ | `deploy/Caddyfile` — automatic HTTPS |
| Database not publicly exposed? | ✅ | `docker-compose.yml` — no port mapping to host |
| WebSocket requires auth? | ✅ | `realtime.ts:45-81` — JWT/API key required, returns 4001 on failure |
| Graceful shutdown? | ✅ | `index.ts:116-131` — SIGTERM/SIGINT handlers with 10s timeout |
| No hardcoded secrets? | ✅ | All secrets via `process.env` or `getSetting()` |
| `.env.example` complete? | ⚠️ | Missing `NODE_ENV`, `DASHBOARD_URL` |

### F.4 Issues Summary

| # | Issue | Severity | File:Line |
|---|-------|----------|-----------|
| S1 | `webhook-verify.ts` compares raw token to hash | **CRITICAL** | `webhook-verify.ts:15-17` |
| S2 | CSV upload has no formula injection prevention | **HIGH** | `upload.ts:60-150` |
| S3 | Dev CORS allows all origins with credentials | **MEDIUM** | `index.ts:31-40` |
| S4 | `custom_code` in pixel snippet injected unsanitized | **MEDIUM** | `pixel-configs.ts:143-144` |
| S5 | Operator `run_sql` doesn't enforce user_id scoping | **MEDIUM** | `operator-tools.ts:384-398` |
| S6 | `.env.example` missing NODE_ENV and DASHBOARD_URL | **LOW** | `.env.example` |

---

## SECTION G: GA4 Assessment

### G.1 What Exists for GA4

**Nothing.** Zero GA4/Google Analytics references in the active codebase:
- No Google API packages in either package.json
- No GA4 property ID fields in app_settings
- No placeholder endpoints for GA4 data
- No imports or references to `googleapis` or `@google-analytics`

### G.2 What Pages Currently Use

| Page | Current Data Source | Type | GA4 Would Add |
|------|-------------------|------|---------------|
| `/website/performance` | FB Ads API (CTR, CPC, CPM, LP views) | **Real** (FB/CC) | Page views, sessions, bounce rate, avg session duration |
| `/website/funnel` | CC orders + FB impressions (computed conversion rates) | **Real** (computed) | Real funnel data from GA4 events |
| `/website/search` | FB/CC metrics | **Real** (FB/CC) | Site search queries from GA4 |
| `/customers/segments` | CC orders (`new_customer_pct`, `subscription_pct`) | **Computed** | User segments, acquisition channels |
| `/customers/cohorts` | Timeseries from FB/CC archives | **Real** (archives) | Retention cohort data |
| `/customers/ltv` | Estimated from AOV, take rates, subscription data | **Computed** | Revenue per user, purchase frequency |
| `/acquisition/source-medium` | CC orders UTM fields | **Real** (CC UTM) | Full UTM attribution from GA4 |
| `/acquisition/attribution` | FB Ads + CC orders JOINed | **Real** (FB+CC) | Multi-touch attribution |

**Key Insight:** Every page has real data from FB/CC. GA4 would **supplement** not replace. The biggest gaps are:
1. **Website behavior data** (bounce rate, session duration, page views) — currently not available
2. **Real funnel events** — currently estimated from ad impressions → orders
3. **Site search** — currently no data source at all
4. **Multi-touch attribution** — currently single-touch (utm_campaign = ad_set_name)

### G.3 GA4 Data Available via API

The GA4 Data API (v1beta) provides:

**Dimensions:** `date`, `sessionSource`, `sessionMedium`, `sessionCampaign`, `pagePath`, `pageTitle`, `deviceCategory`, `country`, `city`, `landingPage`, `eventName`, `transactionId`, `itemName`

**Metrics:** `sessions`, `totalUsers`, `newUsers`, `bounceRate`, `averageSessionDuration`, `screenPageViews`, `conversions`, `totalRevenue`, `purchaseRevenue`, `ecommercePurchases`, `itemRevenue`, `addToCarts`, `checkouts`

**Real-time:** `activeUsers` (by page, source, country)

---

## SECTION H: GA4 Integration Directive

### H.1 Authentication

**Approach:** Google OAuth2 Service Account

**Implementation:**
1. Add `googleapis` package to server: `npm install googleapis`
2. Store credentials as JSON in env var `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded)
3. Store GA4 Property ID in `app_settings` as `ga4_property_id` (configurable in UI)
4. Add to `ConnectionsPage.tsx`: GA4 section with property ID input + service account upload + test button

**New endpoint:**
```
POST /api/settings/test/ga4 — Test GA4 connection using stored credentials
```

**Files to create/modify:**
- `server/src/services/ga4-client.ts` — GA4 API client wrapper
- `server/src/routes/settings.ts` — Add test endpoint
- `client/src/pages/settings/ConnectionsPage.tsx` — Add GA4 config section

### H.2 Data Sync

**Architecture:** Cron-based sync like Facebook, not real-time.

**Sync Schedule:**
- Full day sync: Every 30 minutes (`*/30 * * * *`)
- Real-time metrics: Every 5 minutes (activeUsers only)

**New Database Tables:**

```sql
-- ga4_sessions_today: Daily session/traffic data
CREATE TABLE ga4_sessions_today (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE DEFAULT CURRENT_DATE,
  source VARCHAR(255),
  medium VARCHAR(255),
  campaign VARCHAR(255),
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,4) DEFAULT 0,
  avg_session_duration DECIMAL(10,2) DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- ga4_pages_today: Per-page metrics
CREATE TABLE ga4_pages_today (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE DEFAULT CURRENT_DATE,
  page_path VARCHAR(500),
  page_title VARCHAR(500),
  pageviews INTEGER DEFAULT 0,
  unique_pageviews INTEGER DEFAULT 0,
  avg_time_on_page DECIMAL(10,2) DEFAULT 0,
  bounce_rate DECIMAL(5,4) DEFAULT 0,
  exit_rate DECIMAL(5,4) DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- ga4_events_today: Funnel event tracking
CREATE TABLE ga4_events_today (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE DEFAULT CURRENT_DATE,
  event_name VARCHAR(255),
  event_count INTEGER DEFAULT 0,
  source VARCHAR(255),
  medium VARCHAR(255),
  synced_at TIMESTAMP DEFAULT NOW()
);

-- ga4_sessions_archive: Historical archive
CREATE TABLE ga4_sessions_archive (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  archived_date DATE,
  session_data JSONB,
  archived_at TIMESTAMP DEFAULT NOW()
);
```

**New migration:** `009_ga4_integration.sql`

**Sync Service:** `server/src/services/ga4-sync.ts`
- `syncGA4Sessions()` — Pull session/source/medium data
- `syncGA4Pages()` — Pull per-page metrics
- `syncGA4Events()` — Pull funnel events (add_to_cart, begin_checkout, purchase)
- Add to `scheduler.ts` as new cron job

### H.3 Page Wiring

| Page | Current State | GA4 Enhancement |
|------|--------------|-----------------|
| `/website/performance` | FB CTR/CPC/CPM only | **Add:** Sessions, bounce rate, avg session duration, pageviews chart |
| `/website/funnel` | Estimated from impressions→orders | **Add:** Real GA4 funnel: pageview → add_to_cart → begin_checkout → purchase |
| `/website/search` | No data source | **Add:** GA4 site search queries (if configured in GA4) |
| `/customers/segments` | Computed from CC data | **Add:** GA4 new vs returning users, device category breakdown |
| `/customers/cohorts` | Archive timeseries | **Add:** GA4 retention cohort data |
| `/customers/ltv` | Estimated | **Add:** GA4 purchase frequency, revenue per user |
| `/acquisition/source-medium` | CC UTM fields only | **Merge:** GA4 session-level source/medium with CC conversion data |
| `/acquisition/attribution` | Single-touch (utm→adset) | **Add:** GA4 multi-channel funnel paths |
| `/summary` (KPI cards) | FB spend + CC revenue | **Add:** Active users (real-time), sessions today badges |

**New API endpoints:**
```
GET /api/analytics/ga4/sessions    — Session data with source/medium
GET /api/analytics/ga4/pages       — Per-page metrics
GET /api/analytics/ga4/funnel      — Funnel event data
GET /api/analytics/ga4/realtime    — Active users (cached 5 min)
```

**Implementation pattern:** Follow existing `fetchMetrics()` / `useMetrics()` pattern. Each page fetches GA4 data as a secondary call alongside existing FB/CC data. Display GA4 metrics in new cards/sections within existing pages.

### H.4 Operator Integration

**New tools (3):**

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `get_ga4_sessions` | `period` (optional: today/7d/30d) | Session count, users, bounce rate, sources |
| `get_ga4_top_pages` | `limit` (optional, default 10) | Top pages by pageviews with metrics |
| `get_ga4_funnel` | (none) | Funnel conversion rates from GA4 events |

**System prompt addition:**
```
- Query Google Analytics 4 website traffic data (sessions, pageviews, bounce rate, top pages)
```

**Total tools after GA4: 18**

### H.5 Implementation Order

1. **Migration + Tables** — `009_ga4_integration.sql`
2. **GA4 Client** — `ga4-client.ts` (auth + API wrapper)
3. **GA4 Sync Service** — `ga4-sync.ts` (cron sync)
4. **Settings UI** — GA4 section in ConnectionsPage + test endpoint
5. **API Endpoints** — 4 new GA4 analytics routes
6. **Page Wiring** — Enhance existing pages with GA4 data
7. **Operator Tools** — 3 new tools
8. **Widget** — Add sessions/active users as widget metrics

---

## SECTION I: All Issues Found

### Critical

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| C1 | Webhook verify token lookup broken | `webhook-verify.ts:15-17` | `resolveTokenUserId()` compares raw token against SHA256 hash — will never match. Breaks per-user webhook secret isolation. |
| C2 | UTM naming requirement undocumented | `metrics.ts:102` | `ad_set_name = utm_campaign` exact match required for attribution. No user-facing documentation. |

### High

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| H1 | CSV formula injection | `upload.ts:60-150` | No sanitization of cells starting with `=`, `+`, `-`, `@` |
| H2 | No onboarding guidance | N/A | Empty dashboard after registration with no next-steps guidance |
| H3 | No "Clear All" memories endpoint | `operator.ts` | Frontend may expect bulk delete but only individual delete exists |

### Medium

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| M1 | Dev CORS wide open | `index.ts:31-40` | `origin: true` + `credentials: true` in non-production |
| M2 | Pixel custom_code unsanitized | `pixel-configs.ts:143-144` | User-provided JS injected directly into snippet |
| M3 | Operator SQL no user_id enforcement | `operator-tools.ts:384-398` | AI could accidentally query cross-user data |
| M4 | adjust_budget lacks percentage mode | `operator-tools.ts:84-95` | `increaseBudget()`/`decreaseBudget()` exist but not exposed |
| M5 | Slack config requires env vars only | N/A | No Settings UI for Slack configuration |
| M6 | ANTHROPIC_API_KEY env-only | N/A | Operator fails silently if not set |

### Low

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| L1 | No "vs yesterday" label | `SummaryCards.tsx:38-42` | Delta badge shows percentage but no context label |
| L2 | Widget uses CSS flash, not rAF animation | `widget.js:110-132` | Minor inconsistency with React AnimatedNumber |
| L3 | .env.example incomplete | `.env.example` | Missing `NODE_ENV`, `DASHBOARD_URL` |
| L4 | No Shopify test button | `ConnectionsPage.tsx:261-287` | FB and CC have test, Shopify doesn't |
| L5 | Settings masking confusion | `settings.ts:73-78` | Masked values in placeholders unclear if configured |

---

## SECTION J: Overall Grades

| Category | v4 Grade | Current Grade | Delta | Notes |
|----------|:--------:|:-------------:|:-----:|-------|
| Database & Schema | A | **A** | = | 24 tables, clean migrations, JSONB archives |
| API & Server | A | **A** | = | 70 endpoints, proper auth, rate limiting |
| Metrics Accuracy | A | **A** | = | Attribution JOIN works (when UTMs match) |
| Frontend & UX | A | **A** | = | 28 real pages, lazy loading, responsive |
| Navigation & Routing | A | **A** | = | 29 routes, sidebar nav, command palette |
| Settings & Config | A- | **A-** | = | Comprehensive but Slack/Anthropic env-only |
| SQL Builder | A | **A** | = | Comment stripping, timeout, row limits |
| Operator AI — Text Chat | A | **A** | = | SSE streaming, conversation history |
| Operator AI — Tool Calling | A- | **A** | ↑ | 15 tools, all verified with schema+handler+switch |
| Operator AI — Voice | B+ | **A-** | ↑ | Auto-send in manual mic, wake word, hands-free |
| Operator AI — Memory | B | **B+** | ↑ | Management page exists, but no bulk delete endpoint |
| Rules Engine — Core | A | **A** | = | Cooldown, execution logs, 7 action types |
| Rules Engine — FB Actions | B+ | **B+** | = | adjust_budget still absolute-only, no percentage |
| Rules Engine — Notifications | A- | **A-** | = | In-app + WebSocket, Slack webhook configurable |
| Real-Time (WebSocket) | A | **A** | = | Auth required, graceful reconnect |
| Slack Bot | B+ | **A-** | ↑ | Full tool calling, 9 commands, paginated dashboard |
| Embeddable Widget | B- | **B+** | ↑ | Config page, data-metrics/position, flash effects |
| Mobile Readiness | A- | **A-** | = | Responsive, pull-to-refresh, hamburger nav |
| Auth & Security | B+ | **B** | ↓ | Token hashing bug in webhook-verify.ts, CSV vuln |
| DevOps & Deployment | A | **A** | = | Docker, Caddy, auto-deploy, graceful shutdown |
| Previous Period Comparison | N/A | **A-** | NEW | Working deltas, inverted spend, missing "vs yesterday" label |
| Onboarding Experience | N/A | **C+** | NEW | No wizard, no UTM docs, no test data |
| Documentation | C | **B** | ↑ | README comprehensive, but no user-facing guides |
| **OVERALL** | **A-** | **A-** | **=** | Phase 7 delivered but security regression + onboarding gap |

**Why still A- and not A:**
1. Critical webhook-verify.ts token hashing bug (new regression)
2. CSV formula injection still unaddressed
3. Onboarding experience needs significant work
4. No "Clear All" memories endpoint
5. Budget adjustment still lacks percentage mode

---

## SECTION K: Next Phase Recommendation

### Priority 1: Fix Security Issues (1 day)
1. **Fix `webhook-verify.ts:resolveTokenUserId()`** — Hash token before DB lookup (copy pattern from `webhooks.ts:13`)
2. **Add CSV formula injection prevention** — Strip/escape `=`, `+`, `-`, `@`, `\t` prefixes in upload.ts
3. **Add NODE_ENV to .env.example** with production default

### Priority 2: Onboarding Experience (2-3 days)
1. **Add getting-started checklist** — Show on first login: "Configure Facebook ✗ | Set up Webhooks ✗ | etc."
2. **Document UTM naming requirement** — Prominent warning in Tracking Settings + Connections page
3. **Add sample data generator** — Button to populate demo data for new users
4. **Add Slack configuration to Settings UI** — Move from env-only to configurable

### Priority 3: GA4 Integration (3-5 days)
Follow the directive in Section H:
1. Database migration + tables
2. GA4 client + sync service
3. Settings UI (ConnectionsPage)
4. API endpoints
5. Page wiring (enhance existing pages)
6. 3 new Operator tools

### Priority 4: Polish (1-2 days)
1. **Add "vs yesterday" label** to DeltaBadge
2. **Wire `increaseBudget()`/`decreaseBudget()`** as tool parameters
3. **Add bulk delete memories endpoint** — `DELETE /api/operator/memories`
4. **Add Shopify test button** in ConnectionsPage
5. **Widget rAF animation** — Replace CSS transition with requestAnimationFrame

### Priority 5: Future Considerations
1. **Webhook delivery logs** — Show recent webhook requests with status
2. **Multi-touch attribution** — Leverage GA4 funnel paths
3. **Email notifications** — Currently infrastructure exists but no email provider
4. **User roles/permissions** — Currently single-role (all users are admins)
5. **Data retention policies** — Archive tables grow unbounded

---

*End of Audit Report v5*
*Generated: 2026-02-20*
*Auditor: Claude Opus 4.6*
