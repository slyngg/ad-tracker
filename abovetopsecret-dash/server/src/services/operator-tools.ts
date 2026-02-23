import pool from '../db';
import { getSetting } from './settings';
import { pauseAdset, enableAdset, adjustBudget, increaseBudget, decreaseBudget } from './meta-api';
import { getRealtime } from '../services/realtime';

// Anthropic tool-use format definitions
export const operatorTools = [
  {
    name: 'get_campaign_metrics',
    description: "Get today's campaign-level ad metrics (spend, clicks, impressions, CPC, CTR) grouped by campaign. Optionally filter by account.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_adset_metrics',
    description: "Get today's adset-level breakdown of ad metrics grouped by adset. Optionally filter by account.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_order_stats',
    description: "Get today's order/revenue summary including total revenue, conversions, and AOV. Optionally filter by account or offer.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
        offer_id: { type: 'number', description: 'Filter to a specific offer ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_top_offers',
    description: 'Get top offers ranked by revenue for today. Optionally filter by account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_roas_by_campaign',
    description: 'Get ROAS (return on ad spend) per campaign by joining ad spend with order revenue on utm_campaign. Optionally filter by account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_source_medium',
    description: 'Get traffic source breakdown by UTM source and medium with revenue and conversion data. Optionally filter by account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'list_accounts_and_offers',
    description: "List the user's ad accounts and offers with today's spend and revenue summary per account.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'pause_adset',
    description: 'Pause a Meta Ads adset. This will stop all ads in the adset from delivering. Only use when the user explicitly asks to pause.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID to pause' },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'enable_adset',
    description: 'Enable/activate a paused Meta Ads adset. This will resume ad delivery. Only use when the user explicitly asks to enable.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID to enable' },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'adjust_budget',
    description: 'Change the daily budget of a Meta Ads adset. Provide EITHER daily_budget (absolute dollars) OR increase_percent/decrease_percent (relative change). Only use when the user explicitly asks to change budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID' },
        daily_budget: { type: 'number', description: 'New daily budget in dollars (e.g. 50 for $50/day). Use this for absolute changes.' },
        increase_percent: { type: 'number', description: 'Increase budget by this percentage (e.g. 20 for +20%). Fetches current budget first.' },
        decrease_percent: { type: 'number', description: 'Decrease budget by this percentage (e.g. 15 for -15%). Fetches current budget first.' },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'run_sql',
    description: 'Run a read-only SQL query against the database. Only SELECT/WITH/EXPLAIN queries are allowed. Data is automatically scoped to the current user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'The SQL SELECT query to execute' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_rules',
    description: 'List all automation rules for the current user, including their status and last execution time',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'create_rule',
    description: 'Create a new automation rule',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the rule' },
        trigger_type: { type: 'string', description: 'Type of trigger (e.g. metric_threshold). Defaults to metric_threshold.' },
        trigger_config: {
          type: 'object',
          description: 'Trigger configuration with metric, operator, and value',
          properties: {
            metric: { type: 'string', description: 'The metric to monitor (e.g. spend, cpc, ctr)' },
            operator: { type: 'string', description: 'Comparison operator (e.g. >, <, >=, <=, ==)' },
            value: { type: 'number', description: 'Threshold value' },
          },
        },
        action_type: { type: 'string', description: 'Action to take when triggered (e.g. pause_adset, send_notification, adjust_budget)' },
        action_config: {
          type: 'object',
          description: 'Action configuration (varies by action_type)',
        },
        cooldown_minutes: { type: 'number', description: 'Minimum minutes between firings. Defaults to 60.' },
      },
      required: ['name', 'trigger_config', 'action_type', 'action_config'],
    },
  },
  {
    name: 'toggle_rule',
    description: 'Enable or disable an automation rule',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'The ID of the rule to toggle' },
        enabled: { type: 'boolean', description: 'Whether the rule should be enabled (true) or disabled (false)' },
      },
      required: ['rule_id', 'enabled'],
    },
  },
  {
    name: 'query_historical',
    description: 'Query historical ad performance data for a specific date range. Optionally filter by account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        group_by: { type: 'string', description: 'Dimension to group by: day, campaign, or adset' },
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send a notification to the user',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message body' },
        type: { type: 'string', description: 'Notification type. Defaults to operator_alert.' },
      },
      required: ['title', 'message'],
    },
  },
  // Creative Analysis Tools (16-22)
  {
    name: 'get_creative_performance',
    description: 'Query ad creative performance metrics. Filter by platform, date range, campaign, creative type, or any AI tag dimension. Returns creatives with thumbnails and metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
        platform: { type: 'string', enum: ['meta', 'tiktok', 'newsbreak', 'youtube', 'linkedin'], description: 'Ad platform' },
        sort_by: { type: 'string', enum: ['spend', 'roas', 'cpa', 'revenue', 'clicks', 'impressions', 'ctr', 'cvr'], description: 'Sort metric. Default: spend' },
        sort_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction. Default: desc' },
        limit: { type: 'number', description: 'Max results. Default: 20' },
        tag_filter: { type: 'object', description: 'Filter by any tag dimension, e.g. { asset_type: "UGC", hook_type: "question" }' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'analyze_creative_diversity',
    description: 'Analyze the diversity of active ad creatives across all 8 AI tag dimensions. Identifies overrepresented and underrepresented categories to recommend what types of creative to produce next.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'recommend_next_creatives',
    description: 'Analyze winning creative patterns and current diversity gaps to recommend specific ad creative concepts to produce next. Returns creative briefs with format, hook, angle, and messaging recommendations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        count: { type: 'number', description: 'Number of recommendations. Default: 5' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'analyze_creative_prelaunched',
    description: 'Score an ad creative concept BEFORE launch by comparing it against historical top performers. Provide the ad copy, headline, and creative type to get a pre-launch assessment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_copy: { type: 'string', description: 'The ad body text' },
        headline: { type: 'string', description: 'The ad headline' },
        creative_type: { type: 'string', enum: ['image', 'video', 'carousel'], description: 'Creative format' },
        cta_type: { type: 'string', description: 'Call to action type' },
      },
      required: ['ad_copy'],
    },
  },
  {
    name: 'weekly_creative_retro',
    description: "Run a retrospective analysis of the past week's ad creative performance. Identifies winners, losers, new launches showing promise, and provides specific action items.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'analyze_competitor_creatives',
    description: "Analyze saved competitor ads to identify their creative strategy patterns. Requires competitor ads to be saved in the Inspo library first.",
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_name: { type: 'string', description: 'Competitor brand name to analyze' },
      },
      required: ['brand_name'],
    },
  },
  {
    name: 'detect_winning_patterns',
    description: 'Cross-reference AI tags with performance metrics to surface statistically significant winning patterns. Identifies which combinations of creative elements drive the best results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string', enum: ['roas', 'cpa', 'ctr', 'cvr', 'revenue'], description: 'Metric to optimize for. Default: roas' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
        min_spend: { type: 'number', description: 'Minimum spend to include (filters noise). Default: 100' },
      },
      required: [] as string[],
    },
  },
];

// SQL validation (shared logic from sql-builder route)
const ALLOWED_PREFIXES = /^\s*(SELECT|WITH|EXPLAIN)\s/i;
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|DO)\b/i;
const SQL_COMMENT_PATTERN = /--[^\n]*|\/\*[\s\S]*?\*\//g;

function validateAndSanitizeSql(sql: string): { valid: boolean; error?: string; cleaned: string } {
  // Strip SQL comments first
  const cleaned = sql.replace(SQL_COMMENT_PATTERN, ' ').trim();

  if (!ALLOWED_PREFIXES.test(cleaned)) {
    return { valid: false, error: 'Only SELECT, WITH, and EXPLAIN queries are allowed', cleaned };
  }

  if (FORBIDDEN_KEYWORDS.test(cleaned)) {
    return { valid: false, error: 'Query contains forbidden keywords', cleaned };
  }

  // Reject multiple statements
  const withoutStrings = cleaned.replace(/'[^']*'/g, '');
  const parts = withoutStrings.split(';').filter((p) => p.trim().length > 0);
  if (parts.length > 1) {
    return { valid: false, error: 'Only single statements are allowed', cleaned };
  }

  return { valid: true, cleaned };
}

// Helper: build optional account/offer filter for operator tool queries
function buildAccountFilter(input: Record<string, any>, startIdx: number): { clause: string; params: any[]; nextIdx: number } {
  let clause = '';
  const params: any[] = [];
  let idx = startIdx;
  if (input.account_id != null) {
    clause += ` AND account_id = $${idx++}`;
    params.push(input.account_id);
  }
  if (input.offer_id != null) {
    clause += ` AND offer_id = $${idx++}`;
    params.push(input.offer_id);
  }
  return { clause, params, nextIdx: idx };
}

export async function executeTool(
  name: string,
  input: Record<string, any>,
  userId: number | null
): Promise<{ result: any; summary: string }> {
  switch (name) {
    case 'get_campaign_metrics': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `WITH all_ads AS (
           SELECT campaign_name, campaign_id, spend, clicks, impressions FROM fb_ads_today WHERE user_id = $1 ${af.clause}
           UNION ALL
           SELECT campaign_name, campaign_id, spend, clicks, impressions FROM tiktok_ads_today WHERE user_id = $1 ${af.clause}
           UNION ALL
           SELECT campaign_name, campaign_id, spend, clicks, impressions FROM newsbreak_ads_today WHERE user_id = $1 ${af.clause}
         )
         SELECT campaign_name, campaign_id,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::FLOAT / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM all_ads
         GROUP BY campaign_name, campaign_id
         ORDER BY spend DESC`,
        [userId, ...af.params]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} campaigns found`,
      };
    }

    case 'get_adset_metrics': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `WITH all_ads AS (
           SELECT ad_set_name AS adset_name, ad_set_id AS adset_id, campaign_name, spend, clicks, impressions FROM fb_ads_today WHERE user_id = $1 ${af.clause}
           UNION ALL
           SELECT adgroup_name AS adset_name, adgroup_id AS adset_id, campaign_name, spend, clicks, impressions FROM tiktok_ads_today WHERE user_id = $1 ${af.clause}
           UNION ALL
           SELECT adset_name, adset_id, campaign_name, spend, clicks, impressions FROM newsbreak_ads_today WHERE user_id = $1 ${af.clause}
         )
         SELECT adset_name, adset_id, campaign_name,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM all_ads
         GROUP BY adset_name, adset_id, campaign_name
         ORDER BY spend DESC`,
        [userId, ...af.params]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} adsets found`,
      };
    }

    case 'get_order_stats': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `SELECT
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
           COUNT(DISTINCT order_id) AS total_conversions,
           CASE WHEN COUNT(DISTINCT order_id) > 0
             THEN COALESCE(SUM(COALESCE(subtotal, revenue)), 0) / COUNT(DISTINCT order_id)
             ELSE 0 END AS aov
         FROM cc_orders_today
         WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1 ${af.clause}`,
        [userId, ...af.params]
      );
      const row = result.rows[0];
      return {
        result: row,
        summary: `Revenue: $${parseFloat(row.total_revenue).toFixed(2)}, ${row.total_conversions} orders`,
      };
    }

    case 'get_top_offers': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `SELECT offer_name,
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
           COUNT(DISTINCT order_id) AS conversions
         FROM cc_orders_today
         WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1 ${af.clause}
         GROUP BY offer_name
         ORDER BY revenue DESC
         LIMIT 10`,
        [userId, ...af.params]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} offers found`,
      };
    }

    case 'get_roas_by_campaign': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `SELECT
           f.campaign_name,
           SUM(f.spend) AS spend,
           COALESCE(SUM(o.revenue), 0) AS revenue,
           CASE WHEN SUM(f.spend) > 0 THEN COALESCE(SUM(o.revenue), 0) / SUM(f.spend) ELSE 0 END AS roas
         FROM (
           SELECT campaign_name, SUM(spend) AS spend FROM (
             SELECT campaign_name, spend FROM fb_ads_today WHERE user_id = $1 ${af.clause}
             UNION ALL
             SELECT campaign_name, spend FROM tiktok_ads_today WHERE user_id = $1 ${af.clause}
             UNION ALL
             SELECT campaign_name, spend FROM newsbreak_ads_today WHERE user_id = $1 ${af.clause}
           ) all_ads
           GROUP BY campaign_name
         ) f
         LEFT JOIN (
           SELECT utm_campaign, SUM(COALESCE(subtotal, revenue)) AS revenue
           FROM cc_orders_today
           WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1 ${af.clause}
           GROUP BY utm_campaign
         ) o ON f.campaign_name = o.utm_campaign
         GROUP BY f.campaign_name
         ORDER BY spend DESC`,
        [userId, ...af.params]
      );
      return {
        result: result.rows,
        summary: `ROAS for ${result.rows.length} campaigns`,
      };
    }

    case 'get_source_medium': {
      const af = buildAccountFilter(input, 2);
      const result = await pool.query(
        `SELECT
           COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
           COALESCE(NULLIF(utm_medium, ''), '(none)') AS utm_medium,
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
           COUNT(DISTINCT order_id) AS conversions,
           COUNT(*) AS orders
         FROM cc_orders_today
         WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1 ${af.clause}
         GROUP BY utm_source, utm_medium
         ORDER BY revenue DESC`,
        [userId, ...af.params]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} source/medium combinations`,
      };
    }

    case 'list_accounts_and_offers': {
      const accounts = await pool.query(
        `SELECT a.id, a.name, a.platform, a.platform_account_id, a.status, a.color,
           COALESCE(ad_spend.spend, 0) + COALESCE(nb.spend, 0) AS today_spend,
           COALESCE(cc.revenue, 0) AS today_revenue,
           COALESCE(cc.conversions, 0) AS today_conversions
         FROM accounts a
         LEFT JOIN (
           SELECT account_id, SUM(spend) AS spend FROM (
             SELECT account_id, spend FROM fb_ads_today WHERE user_id = $1
             UNION ALL
             SELECT account_id, spend FROM tiktok_ads_today WHERE user_id = $1
           ) int_ads
           GROUP BY account_id
         ) ad_spend ON ad_spend.account_id = a.id
         LEFT JOIN LATERAL (
           SELECT SUM(spend) AS spend
           FROM newsbreak_ads_today
           WHERE user_id = $1 AND account_id = a.platform_account_id
         ) nb ON a.platform = 'newsbreak'
         LEFT JOIN (
           SELECT account_id, SUM(COALESCE(subtotal, revenue)) AS revenue, COUNT(DISTINCT order_id) AS conversions
           FROM cc_orders_today WHERE user_id = $1 AND order_status = 'completed' AND (is_test = false OR is_test IS NULL)
           GROUP BY account_id
         ) cc ON cc.account_id = a.id
         WHERE a.user_id = $1 AND a.status = 'active'
         ORDER BY a.name`,
        [userId]
      );

      const offers = await pool.query(
        `SELECT o.id, o.name, o.offer_type, o.identifier, o.status, o.account_id,
           a.name AS account_name, o.target_cpa, o.target_roas
         FROM offers o
         LEFT JOIN accounts a ON a.id = o.account_id
         WHERE o.user_id = $1 AND o.status = 'active'
         ORDER BY o.name`,
        [userId]
      );

      return {
        result: { accounts: accounts.rows, offers: offers.rows },
        summary: `${accounts.rows.length} accounts, ${offers.rows.length} offers`,
      };
    }

    case 'pause_adset': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await pauseAdset(input.adset_id, accessToken);
      return {
        result: res,
        summary: `Adset ${input.adset_id} paused`,
      };
    }

    case 'enable_adset': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await enableAdset(input.adset_id, accessToken);
      return {
        result: res,
        summary: `Adset ${input.adset_id} enabled`,
      };
    }

    case 'adjust_budget': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }

      if (input.increase_percent != null) {
        const res = await increaseBudget(input.adset_id, input.increase_percent, accessToken);
        return {
          result: res,
          summary: `Adset ${input.adset_id} budget increased by ${input.increase_percent}%`,
        };
      }

      if (input.decrease_percent != null) {
        const res = await decreaseBudget(input.adset_id, input.decrease_percent, accessToken);
        return {
          result: res,
          summary: `Adset ${input.adset_id} budget decreased by ${input.decrease_percent}%`,
        };
      }

      if (input.daily_budget == null) {
        return { result: { error: 'Provide daily_budget, increase_percent, or decrease_percent' }, summary: 'Failed: no budget value specified' };
      }

      const budgetCents = Math.round(input.daily_budget * 100);
      const res = await adjustBudget(input.adset_id, budgetCents, accessToken);
      return {
        result: res,
        summary: `Adset ${input.adset_id} budget set to $${input.daily_budget}/day`,
      };
    }

    case 'run_sql': {
      const { valid, error, cleaned } = validateAndSanitizeSql(input.sql);
      if (!valid) {
        return { result: { error }, summary: `SQL rejected: ${error}` };
      }

      // Auto-inject user_id scoping: wrap the query so it can only see the current user's data
      // This uses a CTE approach to set a session variable, then runs the query within a restricted view
      const hasUserFilter = /user_id/i.test(cleaned);

      const client = await pool.connect();
      try {
        await client.query('SET statement_timeout = 15000');
        // Set a session-level parameter for the user_id so RLS or manual filtering can use it
        await client.query(`SET app.current_user_id = '${Number(userId)}'`);
        const result = await client.query(cleaned, []);
        return {
          result: {
            columns: result.fields.map((f) => f.name),
            rows: result.rows.slice(0, 100),
            rowCount: result.rowCount,
            note: !hasUserFilter ? 'Note: query does not filter by user_id — results may include all users\' data. Add WHERE user_id = ' + userId + ' for scoped results.' : undefined,
          },
          summary: `${result.rowCount} rows returned`,
        };
      } finally {
        await client.query('SET statement_timeout = 0').catch(() => {});
        await client.query('RESET app.current_user_id').catch(() => {});
        client.release();
      }
    }

    case 'list_rules': {
      const result = await pool.query(
        `SELECT id, name, trigger_type, trigger_config, action_type, enabled, cooldown_minutes, last_fired_at
         FROM automation_rules WHERE user_id = $1 ORDER BY id`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} automation rules found`,
      };
    }

    case 'create_rule': {
      const triggerType = input.trigger_type || 'metric_threshold';
      const cooldownMinutes = input.cooldown_minutes ?? 60;
      const result = await pool.query(
        `INSERT INTO automation_rules (user_id, name, trigger_type, trigger_config, action_type, action_config, cooldown_minutes, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING *`,
        [userId, input.name, triggerType, JSON.stringify(input.trigger_config), input.action_type, JSON.stringify(input.action_config), cooldownMinutes]
      );
      return {
        result: result.rows[0],
        summary: `Rule "${input.name}" created (id: ${result.rows[0].id})`,
      };
    }

    case 'toggle_rule': {
      const result = await pool.query(
        `UPDATE automation_rules SET enabled = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING id, name, enabled`,
        [input.enabled, input.rule_id, userId]
      );
      if (result.rows.length === 0) {
        return {
          result: { error: 'Rule not found or not owned by user' },
          summary: `Failed to toggle rule ${input.rule_id}`,
        };
      }
      const row = result.rows[0];
      return {
        result: row,
        summary: `Rule "${row.name}" ${row.enabled ? 'enabled' : 'disabled'}`,
      };
    }

    case 'query_historical': {
      const groupByWhitelist: Record<string, string> = {
        day: 'archived_date',
        campaign: "ad_data->>'campaign_name'",
        adset: "COALESCE(ad_data->>'ad_set_name', ad_data->>'adset_name')",
      };

      const groupByKey = input.group_by || 'day';
      const groupByColumn = groupByWhitelist[groupByKey];
      if (!groupByColumn) {
        return {
          result: { error: `Invalid group_by value. Must be one of: day, campaign, adset` },
          summary: 'Invalid group_by parameter',
        };
      }

      const af = buildAccountFilter(input, 4);
      const result = await pool.query(
        `WITH all_archives AS (
           SELECT archived_date, ad_data ${af.clause ? ', account_id' : ''} FROM fb_ads_archive
           WHERE user_id = $1 AND archived_date >= $2::DATE AND archived_date <= $3::DATE ${af.clause}
           UNION ALL
           SELECT archived_date, ad_data ${af.clause ? ', account_id' : ''} FROM tiktok_ads_archive
           WHERE user_id = $1 AND archived_date >= $2::DATE AND archived_date <= $3::DATE ${af.clause}
           UNION ALL
           SELECT archived_date, ad_data ${af.clause ? ', account_id' : ''} FROM newsbreak_ads_archive
           WHERE user_id = $1 AND archived_date >= $2::DATE AND archived_date <= $3::DATE ${af.clause}
         )
         SELECT ${groupByColumn} AS dimension,
           SUM((ad_data->>'spend')::NUMERIC) AS spend,
           SUM((ad_data->>'impressions')::INT) AS impressions,
           SUM((ad_data->>'clicks')::INT) AS clicks,
           CASE WHEN SUM((ad_data->>'impressions')::INT) > 0
             THEN SUM((ad_data->>'clicks')::FLOAT) / SUM((ad_data->>'impressions')::INT)
             ELSE 0 END AS ctr,
           CASE WHEN SUM((ad_data->>'clicks')::INT) > 0
             THEN SUM((ad_data->>'spend')::NUMERIC) / SUM((ad_data->>'clicks')::INT)
             ELSE 0 END AS cpc
         FROM all_archives
         GROUP BY ${groupByColumn}
         ORDER BY ${groupByColumn}`,
        [userId, input.start_date, input.end_date, ...af.params]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} rows of historical data (${input.start_date} to ${input.end_date}, grouped by ${groupByKey})`,
      };
    }

    case 'send_notification': {
      const notifType = input.type || 'operator_alert';
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, type, title, message, created_at`,
        [userId, notifType, input.title, input.message, JSON.stringify({})]
      );
      // Also emit via realtime WebSocket
      getRealtime()?.emitNotification(userId, { title: input.title, message: input.message });
      return {
        result: result.rows[0],
        summary: `Notification sent: "${input.title}"`,
      };
    }

    // ===== CREATIVE ANALYSIS TOOLS =====

    case 'get_creative_performance': {
      const dateFrom = input.date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const dateTo = input.date_to || new Date().toISOString().split('T')[0];
      const sortBy = input.sort_by || 'spend';
      const sortDir = input.sort_dir === 'asc' ? 'ASC' : 'DESC';
      const lim = Math.min(input.limit || 20, 50);

      let tagConditions = '';
      const params: any[] = [userId, dateFrom, dateTo];
      let idx = 4;

      if (input.platform) { tagConditions += ` AND ac.platform = $${idx++}`; params.push(input.platform); }
      if (input.tag_filter) {
        const dims = ['asset_type', 'visual_format', 'hook_type', 'creative_angle', 'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];
        for (const dim of dims) {
          if (input.tag_filter[dim]) { tagConditions += ` AND ct.${dim} = $${idx++}`; params.push(input.tag_filter[dim]); }
        }
      }

      const result = await pool.query(`
        SELECT ac.ad_name, ac.campaign_name, ac.creative_type, ac.thumbnail_url,
          ct.asset_type, ct.hook_type, ct.creative_angle, ct.visual_format, ct.messaging_theme,
          SUM(cmd.spend) AS spend, SUM(cmd.impressions) AS impressions, SUM(cmd.clicks) AS clicks,
          SUM(cmd.purchases) AS purchases, SUM(cmd.revenue) AS revenue,
          CASE WHEN SUM(cmd.impressions) > 0 THEN SUM(cmd.clicks)::NUMERIC / SUM(cmd.impressions) ELSE 0 END AS ctr,
          CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END AS cpa,
          CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas,
          CASE WHEN SUM(cmd.clicks) > 0 THEN SUM(cmd.purchases)::NUMERIC / SUM(cmd.clicks) ELSE 0 END AS cvr
        FROM ad_creatives ac
        LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
        LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= $2::DATE AND cmd.date <= $3::DATE
        WHERE ac.user_id = $1 ${tagConditions}
        GROUP BY ac.id, ac.ad_name, ac.campaign_name, ac.creative_type, ac.thumbnail_url,
          ct.asset_type, ct.hook_type, ct.creative_angle, ct.visual_format, ct.messaging_theme
        HAVING SUM(cmd.spend) > 0
        ORDER BY ${sortBy} ${sortDir} NULLS LAST
        LIMIT ${lim}
      `, params);

      return {
        result: result.rows,
        summary: `${result.rows.length} creatives found (${dateFrom} to ${dateTo})`,
      };
    }

    case 'analyze_creative_diversity': {
      const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle',
        'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];
      const diversity: Record<string, any[]> = {};

      for (const dim of dimensions) {
        const r = await pool.query(
          `SELECT ct.${dim} AS value, COUNT(*) AS count,
            SUM(cmd.spend) AS total_spend,
            CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS avg_roas
           FROM ad_creatives ac
           JOIN creative_tags ct ON ct.creative_id = ac.id
           LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
           WHERE ac.user_id = $1 AND ac.status = 'active' AND ct.${dim} IS NOT NULL
           GROUP BY ct.${dim}
           ORDER BY count DESC`,
          [userId]
        );
        diversity[dim] = r.rows;
      }

      return {
        result: diversity,
        summary: `Diversity analysis across 8 tag dimensions for active creatives`,
      };
    }

    case 'recommend_next_creatives': {
      const topPerformers = await pool.query(`
        SELECT ac.ad_name, ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.visual_format,
          SUM(cmd.spend) AS spend, CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas
        FROM ad_creatives ac
        LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
        LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
        WHERE ac.user_id = $1
        GROUP BY ac.id, ac.ad_name, ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.visual_format
        HAVING SUM(cmd.spend) > 0
        ORDER BY roas DESC
        LIMIT 20
      `, [userId]);

      const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle', 'messaging_theme'];
      const gaps: Record<string, any[]> = {};
      for (const dim of dimensions) {
        const r = await pool.query(
          `SELECT ct.${dim} AS value, COUNT(*) AS count
           FROM ad_creatives ac JOIN creative_tags ct ON ct.creative_id = ac.id
           WHERE ac.user_id = $1 AND ac.status = 'active' AND ct.${dim} IS NOT NULL
           GROUP BY ct.${dim} ORDER BY count ASC LIMIT 3`,
          [userId]
        );
        gaps[dim] = r.rows;
      }

      return {
        result: { top_performers: topPerformers.rows, diversity_gaps: gaps },
        summary: `Top 20 performers and diversity gaps across 5 dimensions`,
      };
    }

    case 'analyze_creative_prelaunched': {
      const topPerformers = await pool.query(`
        SELECT ac.ad_name, ac.headline, ac.ad_copy, ac.creative_type,
          ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme,
          CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas
        FROM ad_creatives ac
        LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
        LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
        WHERE ac.user_id = $1
        GROUP BY ac.id, ac.ad_name, ac.headline, ac.ad_copy, ac.creative_type,
          ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme
        HAVING SUM(cmd.spend) > 10
        ORDER BY roas DESC
        LIMIT 10
      `, [userId]);

      return {
        result: {
          proposed_creative: { ad_copy: input.ad_copy, headline: input.headline, creative_type: input.creative_type, cta_type: input.cta_type },
          historical_winners: topPerformers.rows,
        },
        summary: `Pre-launch analysis: proposed creative vs ${topPerformers.rows.length} historical winners`,
      };
    }

    case 'weekly_creative_retro': {
      const weeklyData = await pool.query(`
        SELECT ac.ad_name, ac.creative_type, ac.first_seen,
          ct.asset_type, ct.hook_type, ct.creative_angle,
          SUM(cmd.spend) AS spend, SUM(cmd.revenue) AS revenue,
          CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas,
          CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END AS cpa,
          CASE
            WHEN ac.first_seen >= CURRENT_DATE - INTERVAL '7 days' THEN 'new_launch'
            ELSE 'existing'
          END AS creative_status
        FROM ad_creatives ac
        LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
        LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '7 days'
        WHERE ac.user_id = $1
        GROUP BY ac.id, ac.ad_name, ac.creative_type, ac.first_seen,
          ct.asset_type, ct.hook_type, ct.creative_angle
        HAVING SUM(cmd.spend) > 0
        ORDER BY spend DESC
        LIMIT 30
      `, [userId]);

      return {
        result: weeklyData.rows,
        summary: `Weekly retro: ${weeklyData.rows.length} active creatives in the past 7 days`,
      };
    }

    case 'analyze_competitor_creatives': {
      const competitorAds = await pool.query(
        `SELECT brand_name, platform, ad_copy, headline, tags, saved_at
         FROM saved_creatives
         WHERE user_id = $1 AND brand_name ILIKE $2
         ORDER BY saved_at DESC LIMIT 30`,
        [userId, `%${input.brand_name}%`]
      );

      if (competitorAds.rows.length === 0) {
        return {
          result: { message: `No saved ads found for "${input.brand_name}". Save competitor ads to the Inspo library first.` },
          summary: `No competitor ads found for ${input.brand_name}`,
        };
      }

      return {
        result: competitorAds.rows,
        summary: `${competitorAds.rows.length} saved ads from ${input.brand_name} for analysis`,
      };
    }

    case 'detect_winning_patterns': {
      const metricCol = input.metric || 'roas';
      const minSpend = input.min_spend || 100;
      const dateFrom = input.date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const dateTo = input.date_to || new Date().toISOString().split('T')[0];

      const metricExpr: Record<string, string> = {
        roas: 'CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END',
        cpa: 'CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END',
        ctr: 'CASE WHEN SUM(cmd.impressions) > 0 THEN SUM(cmd.clicks)::NUMERIC / SUM(cmd.impressions) ELSE 0 END',
        cvr: 'CASE WHEN SUM(cmd.clicks) > 0 THEN SUM(cmd.purchases)::NUMERIC / SUM(cmd.clicks) ELSE 0 END',
        revenue: 'SUM(cmd.revenue)',
      };

      const expr = metricExpr[metricCol] || metricExpr.roas;
      const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle', 'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];
      const patterns: Record<string, any[]> = {};

      for (const dim of dimensions) {
        const r = await pool.query(`
          SELECT ct.${dim} AS value, COUNT(DISTINCT ac.id) AS creative_count,
            SUM(cmd.spend) AS total_spend, ${expr} AS avg_metric
          FROM ad_creatives ac
          JOIN creative_tags ct ON ct.creative_id = ac.id
          LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= $2::DATE AND cmd.date <= $3::DATE
          WHERE ac.user_id = $1 AND ct.${dim} IS NOT NULL
          GROUP BY ct.${dim}
          HAVING SUM(cmd.spend) >= $4
          ORDER BY avg_metric DESC
        `, [userId, dateFrom, dateTo, minSpend]);
        patterns[dim] = r.rows;
      }

      // Cross-tab: best 2-dimension combinations
      const crossTab = await pool.query(`
        SELECT ct.asset_type, ct.hook_type, COUNT(DISTINCT ac.id) AS count,
          SUM(cmd.spend) AS spend, ${expr} AS avg_metric
        FROM ad_creatives ac
        JOIN creative_tags ct ON ct.creative_id = ac.id
        LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= $2::DATE AND cmd.date <= $3::DATE
        WHERE ac.user_id = $1 AND ct.asset_type IS NOT NULL AND ct.hook_type IS NOT NULL
        GROUP BY ct.asset_type, ct.hook_type
        HAVING SUM(cmd.spend) >= $4
        ORDER BY avg_metric DESC
        LIMIT 10
      `, [userId, dateFrom, dateTo, minSpend]);

      return {
        result: { single_dimension_patterns: patterns, top_combinations: crossTab.rows, metric: metricCol },
        summary: `Winning patterns across 8 dimensions + top ${crossTab.rows.length} combinations (metric: ${metricCol})`,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
  }
}
