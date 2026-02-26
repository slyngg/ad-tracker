import pool from '../db';
import { createLogger } from '../lib/logger';
import type { AttributionModel } from './pixel-attribution';

const log = createLogger('NewVsReturning');

// ── Types ───────────────────────────────────────────────────────

export interface CustomerMetrics {
  revenue: number;
  conversions: number;
  roas: number | null;
  cpa: number | null;
  aov: number | null;
}

export interface NewCustomerMetrics extends CustomerMetrics {
  nCPA: number | null;
  nROAS: number | null;
}

export interface NewVsReturningMetrics {
  all: CustomerMetrics;
  new: NewCustomerMetrics;
  returning: CustomerMetrics;
}

export interface TimeseriesRow {
  date: string;
  all: CustomerMetrics;
  new: CustomerMetrics;
  returning: CustomerMetrics;
}

export interface PlatformRow {
  platform: string;
  all: CustomerMetrics;
  new: CustomerMetrics;
  returning: CustomerMetrics;
  spend: number | null;
}

type Granularity = 'day' | 'week';

// ── Customer Classification ─────────────────────────────────────

export async function classifyCustomer(
  userId: number,
  email: string | null,
  visitorId: number | null,
  orderId: string,
): Promise<boolean> {
  // Check pixel_events_v2 for prior Purchase events by this visitor or email
  const conditions: string[] = [];
  const params: unknown[] = [userId, orderId];
  let paramIdx = 3;

  if (visitorId) {
    conditions.push(`visitor_id = $${paramIdx}`);
    params.push(visitorId);
    paramIdx++;
  }

  if (email) {
    // Look up all visitor IDs for this email to catch cross-device purchases
    conditions.push(`visitor_id IN (
      SELECT COALESCE(canonical_id, id) FROM pixel_visitors
      WHERE user_id = $1 AND email = $${paramIdx}
    )`);
    params.push(email.toLowerCase());
    paramIdx++;
  }

  if (conditions.length === 0) {
    // No identifiers to check — treat as new
    return true;
  }

  const result = await pool.query(
    `SELECT 1 FROM pixel_events_v2
     WHERE user_id = $1
       AND event_name = 'Purchase'
       AND order_id IS NOT NULL
       AND order_id != $2
       AND (${conditions.join(' OR ')})
     LIMIT 1`,
    params,
  );

  const isNew = result.rows.length === 0;

  log.debug({ userId, visitorId, email, orderId, isNew }, 'Classified customer');

  return isNew;
}

// ── Update first_order_date on pixel_visitors ───────────────────

export async function updateFirstOrderDate(
  visitorId: number,
  orderDate: Date,
): Promise<void> {
  await pool.query(
    `UPDATE pixel_visitors
     SET first_order_date = LEAST(COALESCE(first_order_date, $2), $2)
     WHERE id = $1`,
    [visitorId, orderDate],
  );
}

// ── Spend helper (same approach as pixel-attribution.ts) ────────

async function getSpendByPlatform(userId: number): Promise<Map<string, number>> {
  const spendResult = await pool.query(
    `SELECT source, SUM(spend) AS spend
     FROM (
       SELECT account_name AS source, spend FROM fb_ads_today WHERE user_id = $1
       UNION ALL
       SELECT COALESCE(a.name, 'TikTok') AS source, t.spend
       FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = $1
       UNION ALL
       SELECT COALESCE(a.name, 'NewsBreak') AS source, n.spend
       FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id
       WHERE n.user_id = $1
     ) all_ads
     GROUP BY source`,
    [userId],
  );

  const map = new Map<string, number>();
  for (const row of spendResult.rows) {
    map.set((row.source || '').toLowerCase(), parseFloat(row.spend) || 0);
  }
  return map;
}

function getTotalSpend(spendMap: Map<string, number>): number {
  let total = 0;
  for (const v of spendMap.values()) total += v;
  return total;
}

function buildMetrics(
  revenue: number,
  conversions: number,
  spend: number | null,
): CustomerMetrics {
  return {
    revenue,
    conversions,
    roas: spend && spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : null,
    cpa: conversions > 0 && spend && spend > 0 ? parseFloat((spend / conversions).toFixed(2)) : null,
    aov: conversions > 0 ? parseFloat((revenue / conversions).toFixed(2)) : null,
  };
}

// ── Summary Metrics ─────────────────────────────────────────────

export async function getNewVsReturningMetrics(
  userId: number,
  startDate: string,
  endDate: string,
  model: AttributionModel,
): Promise<NewVsReturningMetrics> {
  const result = await pool.query(
    `SELECT
       is_new_customer,
       SUM(attributed_revenue) AS revenue,
       SUM(credit) AS conversions
     FROM pixel_attribution_results r
     WHERE r.user_id = $1
       AND r.model = $2
       AND r.computed_at::date >= $3::date
       AND r.computed_at::date <= $4::date
     GROUP BY is_new_customer`,
    [userId, model, startDate, endDate],
  );

  let newRevenue = 0, newConversions = 0;
  let retRevenue = 0, retConversions = 0;
  let allRevenue = 0, allConversions = 0;

  for (const row of result.rows) {
    const rev = parseFloat(row.revenue) || 0;
    const conv = parseFloat(row.conversions) || 0;
    allRevenue += rev;
    allConversions += conv;

    if (row.is_new_customer === true) {
      newRevenue += rev;
      newConversions += conv;
    } else {
      retRevenue += rev;
      retConversions += conv;
    }
  }

  const spendMap = await getSpendByPlatform(userId);
  const totalSpend = getTotalSpend(spendMap);

  const allMetrics = buildMetrics(allRevenue, allConversions, totalSpend);
  const newMetrics = buildMetrics(newRevenue, newConversions, totalSpend);
  const retMetrics = buildMetrics(retRevenue, retConversions, totalSpend);

  return {
    all: allMetrics,
    new: {
      ...newMetrics,
      nCPA: newConversions > 0 && totalSpend > 0
        ? parseFloat((totalSpend / newConversions).toFixed(2))
        : null,
      nROAS: totalSpend > 0
        ? parseFloat((newRevenue / totalSpend).toFixed(2))
        : null,
    },
    returning: retMetrics,
  };
}

// ── Timeseries ──────────────────────────────────────────────────

export async function getNewVsReturningTimeseries(
  userId: number,
  startDate: string,
  endDate: string,
  model: AttributionModel,
  granularity: Granularity = 'day',
): Promise<TimeseriesRow[]> {
  const dateTrunc = granularity === 'week' ? 'week' : 'day';

  const result = await pool.query(
    `SELECT
       date_trunc($5, s.date)::date AS period,
       s.is_new_customer,
       SUM(s.attributed_revenue) AS revenue,
       SUM(s.attributed_conversions) AS conversions
     FROM pixel_attribution_summary s
     WHERE s.user_id = $1
       AND s.model = $2
       AND s.date >= $3::date
       AND s.date <= $4::date
     GROUP BY period, s.is_new_customer
     ORDER BY period ASC`,
    [userId, model, startDate, endDate, dateTrunc],
  );

  // Group by period
  const periodMap = new Map<string, { new: { rev: number; conv: number }; ret: { rev: number; conv: number } }>();

  for (const row of result.rows) {
    const period = row.period.toISOString().slice(0, 10);
    if (!periodMap.has(period)) {
      periodMap.set(period, {
        new: { rev: 0, conv: 0 },
        ret: { rev: 0, conv: 0 },
      });
    }
    const entry = periodMap.get(period)!;
    const rev = parseFloat(row.revenue) || 0;
    const conv = parseFloat(row.conversions) || 0;

    if (row.is_new_customer === true) {
      entry.new.rev += rev;
      entry.new.conv += conv;
    } else {
      entry.ret.rev += rev;
      entry.ret.conv += conv;
    }
  }

  const rows: TimeseriesRow[] = [];
  for (const [date, data] of periodMap) {
    const allRev = data.new.rev + data.ret.rev;
    const allConv = data.new.conv + data.ret.conv;
    rows.push({
      date,
      all: buildMetrics(allRev, allConv, null),
      new: buildMetrics(data.new.rev, data.new.conv, null),
      returning: buildMetrics(data.ret.rev, data.ret.conv, null),
    });
  }

  return rows;
}

// ── By Platform ─────────────────────────────────────────────────

export async function getNewVsReturningByPlatform(
  userId: number,
  startDate: string,
  endDate: string,
  model: AttributionModel,
): Promise<PlatformRow[]> {
  const result = await pool.query(
    `SELECT
       COALESCE(tp.platform, 'unknown') AS platform,
       r.is_new_customer,
       SUM(r.attributed_revenue) AS revenue,
       SUM(r.credit) AS conversions
     FROM pixel_attribution_results r
     JOIN pixel_touchpoints tp ON tp.id = r.touchpoint_id
     WHERE r.user_id = $1
       AND r.model = $2
       AND r.computed_at::date >= $3::date
       AND r.computed_at::date <= $4::date
     GROUP BY tp.platform, r.is_new_customer`,
    [userId, model, startDate, endDate],
  );

  // Group by platform
  const platformMap = new Map<string, { new: { rev: number; conv: number }; ret: { rev: number; conv: number } }>();

  for (const row of result.rows) {
    const platform = row.platform || 'unknown';
    if (!platformMap.has(platform)) {
      platformMap.set(platform, {
        new: { rev: 0, conv: 0 },
        ret: { rev: 0, conv: 0 },
      });
    }
    const entry = platformMap.get(platform)!;
    const rev = parseFloat(row.revenue) || 0;
    const conv = parseFloat(row.conversions) || 0;

    if (row.is_new_customer === true) {
      entry.new.rev += rev;
      entry.new.conv += conv;
    } else {
      entry.ret.rev += rev;
      entry.ret.conv += conv;
    }
  }

  const spendMap = await getSpendByPlatform(userId);

  const rows: PlatformRow[] = [];
  for (const [platform, data] of platformMap) {
    const allRev = data.new.rev + data.ret.rev;
    const allConv = data.new.conv + data.ret.conv;
    const spend = spendMap.get(platform.toLowerCase()) || null;

    rows.push({
      platform,
      all: buildMetrics(allRev, allConv, spend),
      new: buildMetrics(data.new.rev, data.new.conv, spend),
      returning: buildMetrics(data.ret.rev, data.ret.conv, spend),
      spend,
    });
  }

  // Sort by total revenue descending
  rows.sort((a, b) => b.all.revenue - a.all.revenue);

  return rows;
}
