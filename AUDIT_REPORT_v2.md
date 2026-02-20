# AUDIT REPORT v2 — AboveTopSecret Dash

**Date:** 2026-02-20
**System:** AboveTopSecret Dash — Ad Performance Tracking Dashboard
**Production URL:** optic-data.com
**Auditor:** Claude Opus 4.6
**Audit Type:** Post-deployment production audit (second audit)

---

## SECTION A: PROJECT OVERVIEW (Updated)

| Field | Value |
|-------|-------|
| Total files (excl node_modules/git/dist) | ~55 |
| New files since last audit | `deploy/Caddyfile`, `deploy/docker-compose.prod.yml`, `deploy/setup-vps.sh`, `server/src/queries/core-metrics.sql`, `server/src/queries/summary.sql`, `server/src/queries/extended-metrics.sql`, `server/src/services/settings.ts`, `server/src/services/cc-polling.ts`, `server/src/services/shopify.ts`, `server/src/routes/settings.ts`, `server/src/routes/sync.ts`, `client/src/components/SettingsPanel.tsx`, `client/src/components/ExportButton.tsx`, `db/migrations/002-add-tax-and-settings.sql`, `db/migrations/003-overrides-unique-constraint.sql`, `.env.example` |
| Removed files since last audit | None observed |
| Framework versions | React 18.2, Express 4.18.2, Vite 5.0.12, PostgreSQL 16, Node 20 (unchanged) |
| New dependencies | `express-rate-limit@^8.2.1` (server), `node-cron@^3.0.3` (already existed but now used differently) |
| Production domain | optic-data.com |
| Deployment method | Docker Compose on VPS, Caddy reverse proxy with auto-SSL |
| Can cold-start cleanly? | **Yes** — `docker compose up --build` creates DB, seeds data, builds client & server, starts Caddy. All config in `.env`. |

---

## SECTION B: PREVIOUS AUDIT FIX STATUS

| # | Issue | Original Severity | Status | Evidence |
|---|-------|------------------|--------|----------|
| 1 | SQL fan-out — many-to-many JOIN inflates all core metrics | BLOCKER | **FIXED** | `server/src/routes/metrics.ts:55-97`: CTEs `fb_agg` and `cc_agg` pre-aggregate both sides before joining. `fb_agg` groups by `(ad_set_name, account_name)`, `cc_agg` groups by `(utm_campaign, offer_name)`. The join is then on pre-aggregated rows, eliminating the many-to-many fan-out. Same pattern in `export.ts:17-60` and `queries/core-metrics.sql`. |
| 2 | Client Nginx has no API reverse proxy | BLOCKER | **FIXED** | `client/Dockerfile:17-26`: Inline Nginx config includes `location /api/ { proxy_pass http://server:4000; }` with proper proxy headers. Production also routes through Caddy (`deploy/Caddyfile:2-4`) which routes `/api/*` to `server:4000`. |
| 3 | Webhook HMAC uses re-serialized JSON instead of raw body | HIGH | **FIXED** | `server/src/index.ts:28-31`: Raw body buffer captured via `verify` callback in `express.json()`. `server/src/middleware/webhook-verify.ts:19-25`: `rawBody` is retrieved from the request and used directly for HMAC computation. Both CheckoutChamp (SHA-256 hex) and Shopify (SHA-256 base64) use the raw buffer. |
| 4 | No .gitignore — build artifacts committed | HIGH | **FIXED** | `.gitignore` exists at `abovetopsecret-dash/.gitignore` with proper entries: `node_modules/`, `dist/`, `build/`, `server/dist/`, `client/dist/`, `.env`, `.env.local`, `.env.production`, `*.log`, `.DS_Store`. `git ls-files` confirms only `.env.example` is tracked, not actual `.env` files. No dist directories tracked. |
| 5 | CORS wide open — all origins allowed | HIGH | **FIXED** | `server/src/index.ts:17-24`: CORS reads `ALLOWED_ORIGIN` env var, splits on comma. In production, `deploy/docker-compose.prod.yml:28` defaults to `https://optic-data.com`. If unset, falls back to `false` (same-origin only) in production, `true` only in development. |
| 6 | manual_overrides missing UNIQUE constraint | HIGH | **FIXED** | `db/init.sql:55`: `UNIQUE(metric_key, offer_name)` is in the schema. `server/src/routes/overrides.ts:29-34`: POST route uses `ON CONFLICT (metric_key, offer_name) DO UPDATE SET`. Migration `003-overrides-unique-constraint.sql` also adds the constraint for existing deployments. |
| 7 | LP CTR metric missing (no landing_page_views) | MEDIUM | **FIXED** | `db/init.sql:13`: `landing_page_views INTEGER DEFAULT 0` column exists. `server/src/services/facebook-sync.ts:77-79`: Extracts `landing_page_view` from FB actions array. `server/src/routes/metrics.ts:92`: LP CTR calculated as `landing_page_views / impressions`. Seed data includes landing_page_views for all rows. |
| 8 | Responsive breakpoint doesn't update on resize | MEDIUM | **FIXED** | `client/src/components/Dashboard.tsx:73-77`: `useEffect` with `resize` event listener updates `isWide` state. `handleResize` is cleaned up on unmount. |
| 9 | No rate limiting on any endpoint | MEDIUM | **FIXED** | `server/src/index.ts:36-54`: Three rate limiters configured — `apiLimiter` (120/min), `webhookLimiter` (300/min), `authLimiter` (15 per 15 min). Applied at lines 57-59 before routes. `express-rate-limit@^8.2.1` added to `server/package.json`. |
| 10 | Extended metrics missing from CSV export | MEDIUM | **FIXED** | `server/src/routes/export.ts:63-100`: All extended metrics (take rates 1/3/5, subscription_pct, sub take rates, upsell take/decline) are queried and joined. CSV headers at line 103 include all 23 columns. |
| 11 | Override tooltip doesn't show original computed value | MEDIUM | **FIXED** | `server/src/routes/metrics.ts:125-139`: Override application stores `original` value before overwriting. `client/src/components/MetricsTable.tsx:83-85`: `title` attribute shows `Original: X → Override: Y by Z` when override exists. Yellow asterisk (*) displayed inline. |
| 12 | Touch targets below 44px minimum | LOW | **PARTIALLY FIXED** | `client/src/components/SettingsPanel.tsx`: Close button at line ~238 has `minHeight: 44, minWidth: 44`. Delete button at line ~444 has `minHeight: 44`. However, `client/src/components/Filters.tsx:12`: Filter select elements have `padding: '12px 16px'` which at font-size 13 gives ~40px height. `client/src/components/ExportButton.tsx:18`: CSV button has `padding: '6px 10px'` — well below 44px. `Dashboard.tsx:109-116`: Settings/Cards/CSV buttons have `padding: '10px 14px'` — borderline at ~36px. |
| 13 | PostgreSQL port 5432 exposed in docker-compose | LOW | **FIXED** | `docker-compose.yml:11-12`: Comment `# No ports exposed — only accessible via Docker network`. No `ports:` section on db service. `deploy/docker-compose.prod.yml`: Same — no ports on db. Database accessible only via internal Docker network. |
| 14 | Placeholder PWA icons | LOW | **NOT FIXED** | `icon-192.png` = 546 bytes, `icon-512.png` = 1,881 bytes. These are tiny — a 192x192 PNG of any real icon would be 5-20KB minimum. These are either blank/placeholder images or extremely minimal placeholders. |
| 15 | No loading skeleton | LOW | **FIXED** | `client/src/components/Dashboard.tsx:140-150`: Loading state renders 6 skeleton divs with `pulse` animation, opacity gradient, and proper styling. |
| 16 | Committed build artifacts (server/dist/, client/dist/) | LOW | **FIXED** | `.gitignore` includes `dist/`, `server/dist/`, `client/dist/`. `git ls-files` confirms no dist directories are tracked. |
| 17 | Bounce Rate not documented | LOW | **FIXED** | `README.md:141`: "Bounce Rate: Requires Google Analytics integration. Not available in this dashboard." Also documents LP CTR limitation and multi-offer spend attribution edge case. |

**Fix Rate:** 14/17 fully fixed, 1/17 partially fixed, 2/17 not fixed

---

## SECTION C: NEW ISSUES (not in first audit)

```
ISSUE: Auth token stored only in JavaScript variable — lost on page refresh
SEVERITY: MEDIUM
FILE: client/src/hooks/useAuth.ts:5, client/src/lib/api.ts:3
DESCRIPTION: authToken is stored as a module-level variable (`let authToken: string | null = null`).
  On page refresh, the token is lost and the user must re-enter it. The README explicitly says
  "Stored in memory only (not localStorage)" — this is a deliberate security choice, but creates
  a bad UX for a dashboard that's meant to be used throughout the day. Every browser refresh
  requires re-authentication.
IMPACT: Users must re-enter their access token on every page load/refresh. On mobile PWA, any
  background app suspension that causes a reload will force re-auth.
```

```
ISSUE: Seed data ships with init.sql — will load on every fresh production deploy
SEVERITY: MEDIUM
FILE: db/init.sql:82-204
DESCRIPTION: The init.sql contains ~20 rows of FB ad seed data, ~60 rows of CC orders, and ~23
  rows of upsell data. This file is mounted as Docker entrypoint init script. On first deploy,
  fake data is inserted alongside any real data that arrives via webhooks/sync. The README
  acknowledges this at line 145: "Fresh deployments include test data for development. For
  production, clear the working tables after initial setup." But the daily reset truncates
  tables nightly — meaning after the first midnight reset, seed data is archived as if real,
  and subsequent days start clean. However, the seed data in the archive is now mixed with
  real archived data with no way to distinguish it.
IMPACT: First day of any fresh deploy shows fake data mixed with real data. Archive tables
  permanently contain fake seed data from day 1. No mechanism to flag or filter it.
```

```
ISSUE: Express server port 4000 exposed directly to internet
SEVERITY: MEDIUM
FILE: docker-compose.yml:31 (`ports: - "4000:4000"`)
DESCRIPTION: The development docker-compose.yml exposes port 4000 directly. The production
  docker-compose.prod.yml does NOT expose port 4000 (server has no `ports:` section), which
  is correct. However, if someone deploys using the root docker-compose.yml instead of the
  prod one, the Express server would be directly accessible, bypassing Caddy SSL and Nginx.
  The setup-vps.sh script correctly uses `deploy/docker-compose.prod.yml`.
IMPACT: Low risk if deployed correctly. The dev compose file is not meant for production.
  But having port 4000 accessible in the dev compose is standard practice.
```

```
ISSUE: No database backup mechanism
SEVERITY: MEDIUM
FILE: (no file — feature missing)
DESCRIPTION: No backup scripts, cron jobs, or pg_dump automation exist. The Docker volume
  `pgdata` persists data across container restarts, but there's no offsite backup. If the VPS
  disk fails or the volume is accidentally deleted, all historical data is lost.
IMPACT: Complete data loss risk. Archive tables contain historical business data with no
  recovery path.
```

```
ISSUE: No uptime monitoring or alerting
SEVERITY: LOW
FILE: (no file — feature missing)
DESCRIPTION: No UptimeRobot, Healthchecks.io, or similar monitoring is configured. The health
  endpoint exists at `/api/health` (server/src/index.ts:61-63) but nothing is polling it. If
  the server goes down, nobody is notified.
IMPACT: Silent outages. Webhook data from CC/Shopify would be lost during downtime with no
  retry mechanism.
```

```
ISSUE: Facebook access token has no expiry handling or alerting
SEVERITY: MEDIUM
FILE: server/src/services/facebook-sync.ts:60-65
DESCRIPTION: FB access tokens expire (typically 60 days for long-lived tokens). The sync code
  logs a warning if the token is not set, and logs errors if sync fails (line 87), but there's
  no proactive expiry detection, no alerting, and no token refresh mechanism. If the token
  expires, syncs silently stop, and the dashboard shows stale/zero FB data with no user
  notification.
IMPACT: After token expiry, all FB metrics (spend, clicks, impressions, CTR, CPM, CPC, LP CTR)
  silently go to zero. Users making ad spend decisions would see no data and might not realize
  the token expired.
```

```
ISSUE: Auth bypass possible if AUTH_TOKEN env var is empty string
SEVERITY: HIGH
FILE: server/src/middleware/auth.ts:8-11, deploy/docker-compose.prod.yml:23
DESCRIPTION: The auth middleware checks `if (!authToken) { next(); return; }`. An empty string
  is falsy in JavaScript, so if AUTH_TOKEN is set to '' (empty string), auth is completely
  bypassed. In `docker-compose.prod.yml:23`, AUTH_TOKEN is set as `${AUTH_TOKEN}` (no default),
  so if the env var is not set in the deploy/.env, it becomes an empty string, and auth is
  skipped in production. The setup-vps.sh script does prompt for AUTH_TOKEN, so a properly
  executed setup would have it set. But if someone manually creates the .env and forgets this
  field, the dashboard is completely open.
IMPACT: Dashboard accessible without authentication if AUTH_TOKEN env var is missing or empty.
  All ad spend data exposed to the public internet.
```

```
ISSUE: Server-side export endpoint doesn't check auth via query parameter
SEVERITY: LOW
FILE: client/src/lib/api.ts:130-131, server/src/routes/export.ts
DESCRIPTION: `getExportUrl()` generates a URL with `?token=...` for CSV export, but the server
  export route doesn't read this query parameter — it relies on the standard Bearer header via
  authMiddleware. The function `getExportUrl()` appears unused (the ExportButton component
  generates CSV client-side instead). Dead code, but not a security issue.
IMPACT: None — dead code. But confusing for maintainers.
```

```
ISSUE: Hardcoded fallback database credentials in source code
SEVERITY: LOW
FILE: server/src/db.ts:4
DESCRIPTION: `connectionString: process.env.DATABASE_URL || 'postgres://ats_user:changeme@localhost:5432/abovetopsecret'`.
  The fallback includes the default password `changeme`. In production, DATABASE_URL is always
  set via docker-compose, so this fallback never triggers. But the password is in source code.
IMPACT: Minimal — the fallback only applies in local dev without Docker. But it normalizes
  having credentials in source code.
```

```
ISSUE: Client-side CSV export missing LP CTR column
SEVERITY: LOW
FILE: client/src/components/ExportButton.tsx:8-19
DESCRIPTION: The client-side ExportButton generates CSV with 18 columns but omits LP CTR and
  upsell_decline_rate. The server-side CSV export (export.ts) includes all 23 columns including
  LP CTR and upsell_decline_rate. So the server export is complete, but the quick client-side
  export button is missing two metrics.
IMPACT: Users clicking the CSV button in the UI get a slightly incomplete export compared to
  the server-side endpoint.
```

```
ISSUE: Scheduler sync interval is hardcoded — settings panel shows "Sync Interval" but it doesn't work
SEVERITY: LOW
FILE: server/src/services/scheduler.ts:8, client/src/components/SettingsPanel.tsx
DESCRIPTION: The scheduler hardcodes `*/10 * * * *` for FB sync. The SettingsPanel lets users
  set `sync_interval_minutes` but the scheduler never reads this setting. The cron schedule is
  fixed at startup and never changes.
IMPACT: The "Facebook Sync Interval" setting in the UI is non-functional. It appears to save
  but has no effect.
```

---

## SECTION D: PRODUCTION READINESS SCORECARD

| Check | Status | Details |
|-------|--------|---------|
| HTTPS enforced | ✅ | Caddy at `deploy/Caddyfile:1` handles `optic-data.com` — Caddy automatically provisions Let's Encrypt TLS. |
| HTTP→HTTPS redirect | ✅ | Caddy does this automatically. `www.optic-data.com` also redirects to bare domain (line 10-12). |
| Auth required (not bypassable) | ⚠️ | Auth works IF AUTH_TOKEN is set in .env. If env var is missing/empty, auth is completely skipped. `server/src/middleware/auth.ts:9`. |
| Default passwords changed | ⚠️ | Cannot verify — depends on deploy/.env which is not committed. `docker-compose.prod.yml:8` uses `${DB_PASSWORD}` without default, so setup-vps.sh prompts for it. But `docker-compose.yml:8` defaults to `changeme`. |
| CORS locked to optic-data.com | ✅ | `deploy/docker-compose.prod.yml:28`: `ALLOWED_ORIGIN: ${ALLOWED_ORIGIN:-https://optic-data.com}`. |
| Rate limiting active | ✅ | Three tiers: API 120/min, webhooks 300/min, auth 15/15min. `server/src/index.ts:36-59`. |
| Webhook verification functional | ✅ | Raw body HMAC with timing-safe compare. Rejects if secret not configured in production. `webhook-verify.ts:13-16`. |
| Database not publicly accessible | ✅ | No ports exposed on db service in either compose file. Firewall (setup-vps.sh:38-41) only allows 22/80/443. |
| Express server not directly accessible | ✅ (prod) | `docker-compose.prod.yml` has no ports on server. Caddy proxies `/api/*` to internal `server:4000`. Dev compose exposes 4000 but that's expected. |
| Persistent database volume | ✅ | Named volume `pgdata` in both compose files. Survives container restarts. |
| Database backups | ❌ | No backup scripts, no pg_dump cron, no offsite backup. |
| FB token expiry handling | ❌ | No expiry detection, no refresh, no alerting. Token will silently expire. |
| Error logging | ⚠️ | `console.error` on all catch blocks. No structured logging (no morgan/pino/winston). No log rotation. Docker logs will grow unbounded. |
| Uptime monitoring | ❌ | Health endpoint exists at `/api/health` but nothing monitors it. |
| Health check endpoint | ✅ | `server/src/index.ts:61-63`: Returns `{ status: 'ok', timestamp }`. |
| Seed data separated from prod data | ❌ | Seed data in `db/init.sql:82-204` loads on first deploy. No flag/mechanism to distinguish from real data. |
| PWA manifest correct for prod domain | ✅ | `manifest.json` uses relative paths (`/`, `/icon-192.png`, `/icon-512.png`). `start_url: "/"` works for any domain. |
| No hardcoded localhost references | ⚠️ | `server/src/db.ts:4`: Fallback connection string has `localhost:5432` with `changeme` password. `client/vite.config.ts:10`: Dev proxy to localhost (expected). No localhost in prod code paths. |
| .gitignore prevents secret leaks | ✅ | `.gitignore` covers `.env`, `.env.local`, `.env.production`. Only `.env.example` is tracked. |
| No secrets in git history | ✅ | `git log --all --diff-filter=A -- '*.env' '.env*'` shows only `.env.example` with placeholder values. |

---

## SECTION E: METRIC ACCURACY STATUS

### SQL Trace Test

Using seed data, tracing `ad_set_name = 'collagen-broad-25-54f'` (ad_set_id `as_001`):

**FB side (fb_agg CTE):**
- Two ads: `collagen_video_1` (spend=1842.50, clicks=487, impressions=34210, lpv=341) and `collagen_static_2` (spend=1356.00, clicks=362, impressions=28100, lpv=254)
- CTE aggregates to: spend=3198.50, clicks=849, impressions=62310, lpv=595

**CC side (cc_agg CTE for utm_campaign='collagen-broad-25-54f'):**
- Orders: ORD-1001 (89.95), ORD-1002 (149.95), ORD-1003 (34.95), ORD-1012 (34.95), ORD-6001 (89.95 shopify)
- All status='completed', 5 distinct order_ids
- CTE aggregates to: revenue=399.75, conversions=5, new_customers=4 (ORD-1003 and one other are not new)

Wait — checking new_customer flags: ORD-1001 (true), ORD-1002 (true), ORD-1003 (false), ORD-1012 (true), ORD-6001 (true) → 4 new customers out of 5.

**After JOIN (fb_agg LEFT JOIN cc_agg):**
Since both are pre-aggregated, the join produces exactly 1 row for this ad_set + offer combo:
- spend = 3198.50 ✅ (not inflated)
- revenue = 399.75 ✅ (not inflated)
- ROI = 399.75/3198.50 = 0.125 ✅
- CPA = 3198.50/5 = 639.70 ✅
- AOV = 399.75/5 = 79.95 ✅
- CTR = 849/62310 = 0.01363 ✅
- CPM = (3198.50/62310)*1000 = 51.33 ✅
- CPC = 3198.50/849 = 3.77 ✅
- CVR = 5/849 = 0.00589 ✅
- conversions = 5 ✅
- new_customer_pct = 4/5 = 0.80 ✅ (cannot exceed 1.0 because numerator ≤ denominator)
- lp_ctr = 595/62310 = 0.00955 ✅

**Verification: Can new_customer_pct ever exceed 100%?**
The CTE uses `COUNT(DISTINCT CASE WHEN new_customer THEN order_id END)` for numerator and `COUNT(DISTINCT order_id)` for denominator. Since the CASE WHEN is a subset of all order_ids, the numerator can never exceed the denominator. **No, it cannot exceed 100%.** ✅

**Summary query:** Uses independent subqueries — no join at all (`metrics.ts:164-170`). Each metric comes from its own table directly. No fan-out possible. ✅

**Export query:** Uses identical CTE pattern as core metrics (`export.ts:17-60`). ✅

**Edge case — ad_set with no matching orders:**
LEFT JOIN means the fb_agg row persists. `cc.*` columns are NULL. `COALESCE` handles nulls: revenue=0, conversions=0. Division-by-zero guarded with CASE WHEN checks. ✅

**Edge case — orders with no matching ad_set:**
These are dropped by the LEFT JOIN (from fb_agg to cc_agg). Orders whose utm_campaign doesn't match any ad_set_name simply don't appear. This is a **known limitation** — there's no RIGHT JOIN or FULL OUTER JOIN to capture unmatched orders. Noted in README line 143.

**Edge case — both tables empty:**
fb_agg returns 0 rows → LEFT JOIN produces 0 rows → empty array returned. Summary uses independent subqueries with COALESCE, returns zeros. ✅

| Metric | First Audit | Current Status | Evidence |
|--------|-------------|---------------|----------|
| Spend | ❌ Broken (5x inflated) | ✅ FIXED | CTE pre-aggregates fb_ads per ad_set. No multiplication. `metrics.ts:56-63` |
| Revenue | ❌ Broken (2x inflated) | ✅ FIXED | CTE pre-aggregates cc_orders per utm_campaign. `metrics.ts:64-73` |
| ROI | ❌ Broken | ✅ FIXED | Derived from fixed spend/revenue. `metrics.ts:81` |
| CPA | ⚠️ Partial | ✅ FIXED | spend/conversions with fixed spend. `metrics.ts:82` |
| AOV | ⚠️ Partial | ✅ FIXED | revenue/conversions with fixed revenue. `metrics.ts:83` |
| CTR | ❌ Broken | ✅ FIXED | clicks/impressions from pre-aggregated CTE. `metrics.ts:84` |
| CPM | ❌ Broken | ✅ FIXED | spend/impressions from pre-aggregated CTE. `metrics.ts:85` |
| CPC | ❌ Broken | ✅ FIXED | spend/clicks from pre-aggregated CTE. `metrics.ts:86` |
| CVR | ❌ Broken | ✅ FIXED | conversions/clicks with pre-aggregated values. `metrics.ts:87` |
| Conversions | ✅ Correct | ✅ Still correct | COUNT(DISTINCT order_id) in CTE. `metrics.ts:70` |
| New Customer % | ❌ Broken (>100% possible) | ✅ FIXED | Both numerator and denominator use COUNT(DISTINCT order_id). `metrics.ts:89-91`. Max is 1.0. |
| LP CTR | ❌ Missing | ✅ FIXED | `landing_page_views` column added, extracted from FB actions, calculated as lpv/impressions. `metrics.ts:92` |
| Take Rates | ✅ Correct | ✅ Still correct | Independent query, no join. `metrics.ts:98-104` |
| Sub % | ✅ Correct | ✅ Still correct | Independent query. `metrics.ts:107-111` |
| Sub Take Rates | ✅ Correct | ✅ Still correct | Independent query. `metrics.ts:114-120` |
| Upsell Take | ✅ Correct | ✅ Still correct | Independent query. `metrics.ts:123-128` |
| Upsell Decline | ✅ Correct | ✅ Still correct | Computed as complement of upsell take. `metrics.ts:127` |

---

## SECTION F: SECURITY POSTURE (Production)

| Threat | Mitigation Status | Risk Level | Details |
|--------|-------------------|------------|---------|
| Brute-force auth | Mitigated | LOW | Rate limiter: 15 attempts per 15 minutes on `/api/auth`. `index.ts:47-50`. Timing-safe comparison prevents timing attacks. |
| Webhook spoofing | Mitigated | LOW | HMAC-SHA256 with raw body buffer, timing-safe compare. Rejects if secret not configured in production. `webhook-verify.ts`. |
| SQL injection | Mitigated | LOW | All queries use parameterized statements (`$1, $2...`). No string interpolation in SQL. |
| XSS | Mitigated | LOW | React auto-escapes output. CSV export uses `csvSafe()` to prevent formula injection. No `dangerouslySetInnerHTML`. |
| CSRF via open CORS | Mitigated | LOW | CORS locked to `optic-data.com` in production. Bearer token required in Authorization header (not cookies), so CSRF is not applicable. |
| Token theft (network) | Mitigated | LOW | HTTPS enforced via Caddy. Token sent only in Authorization header over TLS. |
| Token theft (client storage) | Mitigated | LOW | Token stored in JS variable only, not localStorage/cookies. Cannot be stolen by XSS accessing storage. Lost on page refresh (trade-off). |
| Database breach via exposed port | Mitigated | LOW | DB has no published ports. UFW firewall allows only 22/80/443. |
| Secret leakage via git | Mitigated | LOW | `.gitignore` covers `.env` files. Git history clean — only `.env.example` with placeholder values. |
| FB token expiry = silent data loss | **Not mitigated** | **HIGH** | No expiry detection, no alerting, no refresh. FB data will silently stop updating when token expires. |
| DDoS on API endpoints | Partially mitigated | MEDIUM | Rate limiting active (120/min API, 300/min webhooks). No WAF, no Cloudflare. Single server, no horizontal scaling. Caddy provides basic protection but a sustained attack would overwhelm it. |
| Auth bypass via empty AUTH_TOKEN | **Not mitigated** | **HIGH** | If AUTH_TOKEN env var is missing or empty, auth middleware passes all requests through. `auth.ts:9`. |

---

## SECTION G: WHAT HAPPENS RIGHT NOW (Updated)

**If a team member opens optic-data.com on their phone right now, here's exactly what they experience:**

1. **Page loads?** Yes — Caddy serves the client at port 443 with auto-provisioned Let's Encrypt TLS. HTTP automatically redirects to HTTPS. `www.optic-data.com` redirects to `optic-data.com`.

2. **Login screen?** If AUTH_TOKEN is configured in the deploy/.env, yes — they see a dark-themed login screen with "AboveTopSecret Dash" branding and a password input. If AUTH_TOKEN is not set, the app auto-detects dev mode (tries `/api/metrics/summary` without auth) and skips login.

3. **After auth, do they see data?** Yes — if this is the first deployment and no midnight reset has occurred, they see the seed data (fake numbers for Collagen Peptides, Super Greens, Protein Blend, etc.). If FB and CC integrations are configured, real data mixes with seed data until the first midnight reset. After midnight, seed data is archived and real data starts fresh.

4. **Are the numbers correct?** **Yes** — the SQL fan-out bug is fixed. All core metrics (spend, revenue, ROI, CPA, AOV, CTR, CPM, CPC, CVR, new_customer_pct, LP CTR) are computed from pre-aggregated CTEs. No metric inflation. Summary cards use independent subqueries. However, **if FB token has expired**, all FB-sourced metrics (spend, clicks, impressions, LP views) would be stale or zero while CC data continues flowing.

5. **Does the mobile card view work?** Yes — responsive detection with resize listener. Under 768px width, cards are shown instead of the table. Each card shows offer name, account, ROI (color-coded), spend, revenue, conversions, CPA. Tap to expand shows 13 additional metrics. Pull-to-refresh works.

6. **Does CSV export work?** The CSV button in the header generates a client-side CSV from the currently displayed data. It includes 18 of the 23 columns (missing LP CTR and upsell_decline_rate). The server-side `/api/export/csv` endpoint includes all 23 columns but isn't wired to a UI button.

7. **Does pull-to-refresh work?** Yes — `Dashboard.tsx:82-99` implements touch-based pull-to-refresh with visual indicator and 60px threshold.

8. **What happens when new orders come in?** Webhooks to `/api/webhooks/checkout-champ` and `/api/webhooks/shopify` insert/update orders in real-time. CheckoutChamp API polling runs every minute. Dashboard auto-refreshes every 60 seconds. Data appears within 1-2 minutes.

---

## SECTION H: PRIORITIZED FIX LIST (Updated)

1. **AUTH_TOKEN empty string bypass** — `server/src/middleware/auth.ts:8-11`
   Severity: HIGH. Change `if (!authToken)` to `if (!authToken || authToken.trim() === '')` or require AUTH_TOKEN to be set in production. Better: check `NODE_ENV === 'production' && !authToken` → throw startup error.

2. **Facebook token expiry detection** — `server/src/services/facebook-sync.ts`
   Severity: HIGH. Add error code detection (error code 190 = expired token). Store last successful sync timestamp. Add a `/api/health` check that flags stale FB data. Alert via webhook/email when sync fails repeatedly.

3. **Database backups** — Missing entirely
   Severity: MEDIUM. Add a cron job that runs `pg_dump` daily and uploads to S3/B2/remote storage. Or use a managed PostgreSQL service.

4. **Seed data in production** — `db/init.sql:82-204`
   Severity: MEDIUM. Split init.sql into `schema.sql` (tables/indexes only) and `seed.sql` (test data). Only mount `schema.sql` in production docker-compose.

5. **Uptime monitoring** — Missing entirely
   Severity: MEDIUM. Configure UptimeRobot or Healthchecks.io to poll `/api/health`. Set up alerting.

6. **Sync interval setting non-functional** — `server/src/services/scheduler.ts:8`
   Severity: LOW. Either make the scheduler read `sync_interval_minutes` setting, or remove the misleading UI control in SettingsPanel.

7. **Client CSV export missing LP CTR and upsell_decline_rate** — `client/src/components/ExportButton.tsx:8-19`
   Severity: LOW. Add the missing columns to match the server-side export.

8. **PWA icons are placeholders** — `client/public/icon-192.png` (546 bytes), `icon-512.png` (1881 bytes)
   Severity: LOW. Replace with actual branded icons.

9. **Touch targets below 44px on some buttons** — `ExportButton.tsx:18`, `Filters.tsx:12`
   Severity: LOW. Increase padding on CSV button and filter selects to meet 44px minimum.

10. **Structured logging** — `server/src/index.ts` (no logging middleware)
    Severity: LOW. Add morgan or pino for request logging. Add log rotation or Docker log limits.

11. **Dead code: `getExportUrl()` function** — `client/src/lib/api.ts:129-132`
    Severity: LOW. Remove unused function to reduce confusion.

---

## SECTION I: OVERALL GRADE (Updated)

| Category | First Audit Grade | Current Grade | Change | Justification |
|----------|------------------|---------------|--------|---------------|
| Database & Schema | B+ | **A-** | ↑ | UNIQUE constraint added, landing_page_views column added, subtotal/tax columns, app_settings table, archive tables, proper indexes. Seed data in init.sql is the only concern. |
| API & Server | C | **A-** | ↑↑ | Rate limiting, raw body HMAC, settings API, health endpoint, CC polling, graceful shutdown. Auth empty-string bypass is the main deduction. |
| Metrics Accuracy | F | **A** | ↑↑↑ | All metrics now correct. CTE pre-aggregation eliminates fan-out. new_customer_pct bounded. LP CTR implemented. Summary uses independent queries. Export matches core. |
| Frontend & UX | A- | **A-** | → | Loading skeletons, resize listener, pull-to-refresh, settings panel, override tooltips. Export button still missing 2 columns. Auth UX (no persistent token) is a trade-off. |
| Mobile Readiness | B+ | **A-** | ↑ | Resize listener works, pull-to-refresh, card view with expand/collapse. Touch targets still borderline on some buttons. |
| PWA Implementation | B | **B** | → | Icons still placeholder (546 bytes / 1881 bytes). Manifest, service worker, and offline support are functional. |
| Auth & Security | C- | **B+** | ↑↑ | CORS locked, rate limiting, timing-safe auth, HMAC webhooks with raw body, parameterized SQL, CSV sanitization. Deducted for empty-token bypass and no FB token expiry handling. |
| DevOps & Deployment | C+ | **A-** | ↑↑ | Caddy auto-SSL, production docker-compose, VPS setup script, UFW firewall, DB not exposed, proper .gitignore. Deducted for no backups and no monitoring. |
| Code Quality | B | **A-** | ↑ | SQL extracted to .sql files, services properly separated (settings, cc-polling, shopify), TypeScript throughout, error boundaries, clean code. Minor dead code in api.ts. |
| Documentation | A- | **A** | ↑ | Complete README with architecture diagram, all env vars documented, webhook setup guides, known limitations, security section, dev guide. |
| **Production Readiness** (NEW) | N/A | **B** | — | HTTPS works, auth works (with caveat), CORS locked, DB secured, rate limiting active. Missing: backups, monitoring, FB token lifecycle, seed data separation. |
| **OVERALL** | **C** | **B+** | ↑↑ | Massive improvement. Every BLOCKER and HIGH severity issue from the first audit was fixed correctly. The SQL fan-out fix is verified correct. Production deployment is functional with Caddy auto-SSL. Remaining issues are operational (backups, monitoring) and one auth edge case. |

---

## APPENDIX: FILE-BY-FILE VERIFICATION INDEX

| File | Lines | Verified | Notes |
|------|-------|----------|-------|
| server/src/index.ts | 85 | ✅ | CORS, rate limiting, raw body, health check, graceful shutdown |
| server/src/routes/metrics.ts | 151 | ✅ | CTE-based queries, override application with original tracking |
| server/src/routes/export.ts | 131 | ✅ | Same CTE pattern, all 23 columns, CSV sanitization |
| server/src/routes/webhooks.ts | 123 | ✅ | CC + Shopify handlers, tax extraction, ON CONFLICT |
| server/src/routes/overrides.ts | 52 | ✅ | ON CONFLICT (metric_key, offer_name) |
| server/src/routes/settings.ts | 110 | ✅ | CRUD + test endpoints for FB and CC |
| server/src/routes/sync.ts | 16 | ✅ | Manual FB sync trigger |
| server/src/middleware/auth.ts | 27 | ✅ | Timing-safe compare, dev mode skip (empty token issue) |
| server/src/middleware/webhook-verify.ts | 62 | ✅ | Raw body HMAC, production enforcement |
| server/src/db.ts | 12 | ✅ | Pool config, hardcoded fallback credentials |
| server/src/services/facebook-sync.ts | 93 | ✅ | Pagination, landing_page_view extraction, per-account error handling |
| server/src/services/scheduler.ts | 52 | ✅ | FB sync (10min), CC poll (1min), daily reset (midnight) |
| server/src/services/settings.ts | 75 | ✅ | DB + env fallback, sensitive value masking |
| server/src/services/cc-polling.ts | 107 | ✅ | API polling with status filtering |
| server/src/services/checkout-champ.ts | 50 | ✅ | ON CONFLICT upserts |
| server/src/services/shopify.ts | 43 | ✅ | Order processing |
| client/src/App.tsx | 128 | ✅ | Error boundary, login screen, dev mode detection |
| client/src/components/Dashboard.tsx | 215 | ✅ | Resize listener, pull-to-refresh, skeleton loading |
| client/src/components/MetricsTable.tsx | 102 | ✅ | Override tooltips, sticky columns |
| client/src/components/MobileCard.tsx | 98 | ✅ | Expand/collapse with all metrics |
| client/src/components/SettingsPanel.tsx | ~450 | ✅ | 3-tab panel: connections, overrides, dashboard |
| client/src/hooks/useAuth.ts | 68 | ✅ | Memory-only token, dev mode check |
| client/src/hooks/useMetrics.ts | 60 | ✅ | Auto-refresh 60s, loading/refreshing states |
| client/src/lib/api.ts | 140 | ✅ | Type-safe API client, dead getExportUrl() |
| client/Dockerfile | 26 | ✅ | Multi-stage build, inline Nginx config with API proxy |
| docker-compose.yml | 44 | ✅ | Dev config, DB port not exposed, default changeme password |
| deploy/docker-compose.prod.yml | 60 | ✅ | Caddy, no ports on server/DB, ALLOWED_ORIGIN defaults to optic-data.com |
| deploy/Caddyfile | 12 | ✅ | Auto-SSL, API proxy, www redirect |
| deploy/setup-vps.sh | 99 | ✅ | Docker install, UFW firewall, .env prompts |
| db/init.sql | 205 | ✅ | Schema + seed data, UNIQUE constraints, archive tables |

---

*End of Audit Report v2*
