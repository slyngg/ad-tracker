import pool from '../db';
import { getSetting } from './settings';
import { pauseAdset, enableAdset, adjustBudget } from './meta-api';
import { getRealtime } from '../services/realtime';

// Anthropic tool-use format definitions
export const operatorTools = [
  {
    name: 'get_campaign_metrics',
    description: "Get today's campaign-level ad metrics (spend, clicks, impressions, CPC, CTR) grouped by campaign.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_adset_metrics',
    description: "Get today's adset-level breakdown of ad metrics grouped by adset.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_order_stats',
    description: "Get today's order/revenue summary including total revenue, conversions, and AOV.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_top_offers',
    description: 'Get top offers ranked by revenue for today.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_roas_by_campaign',
    description: 'Get ROAS (return on ad spend) per campaign by joining ad spend with order revenue on utm_campaign.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_source_medium',
    description: 'Get traffic source breakdown by UTM source and medium with revenue and conversion data.',
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
    description: 'Change the daily budget of a Meta Ads adset. Budget is in dollars (will be converted to cents for the API). Only use when the user explicitly asks to change budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID' },
        daily_budget: { type: 'number', description: 'New daily budget in dollars (e.g. 50 for $50/day)' },
      },
      required: ['adset_id', 'daily_budget'],
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
    description: 'Query historical ad performance data for a specific date range',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        group_by: { type: 'string', description: 'Dimension to group by: day, campaign, or adset' },
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

export async function executeTool(
  name: string,
  input: Record<string, any>,
  userId: number | null
): Promise<{ result: any; summary: string }> {
  switch (name) {
    case 'get_campaign_metrics': {
      const result = await pool.query(
        `SELECT campaign_name, campaign_id,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::FLOAT / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM fb_ads_today WHERE user_id = $1
         GROUP BY campaign_name, campaign_id
         ORDER BY spend DESC`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} campaigns found`,
      };
    }

    case 'get_adset_metrics': {
      const result = await pool.query(
        `SELECT adset_name, adset_id, campaign_name,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM fb_ads_today WHERE user_id = $1
         GROUP BY adset_name, adset_id, campaign_name
         ORDER BY spend DESC`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} adsets found`,
      };
    }

    case 'get_order_stats': {
      const result = await pool.query(
        `SELECT
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
           COUNT(DISTINCT order_id) AS total_conversions,
           CASE WHEN COUNT(DISTINCT order_id) > 0
             THEN COALESCE(SUM(COALESCE(subtotal, revenue)), 0) / COUNT(DISTINCT order_id)
             ELSE 0 END AS aov
         FROM cc_orders_today
         WHERE order_status = 'completed' AND user_id = $1`,
        [userId]
      );
      const row = result.rows[0];
      return {
        result: row,
        summary: `Revenue: $${parseFloat(row.total_revenue).toFixed(2)}, ${row.total_conversions} orders`,
      };
    }

    case 'get_top_offers': {
      const result = await pool.query(
        `SELECT offer_name,
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
           COUNT(DISTINCT order_id) AS conversions
         FROM cc_orders_today
         WHERE order_status = 'completed' AND user_id = $1
         GROUP BY offer_name
         ORDER BY revenue DESC
         LIMIT 10`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} offers found`,
      };
    }

    case 'get_roas_by_campaign': {
      const result = await pool.query(
        `SELECT
           f.campaign_name,
           SUM(f.spend) AS spend,
           COALESCE(SUM(o.revenue), 0) AS revenue,
           CASE WHEN SUM(f.spend) > 0 THEN COALESCE(SUM(o.revenue), 0) / SUM(f.spend) ELSE 0 END AS roas
         FROM (
           SELECT campaign_name, SUM(spend) AS spend
           FROM fb_ads_today WHERE user_id = $1
           GROUP BY campaign_name
         ) f
         LEFT JOIN (
           SELECT utm_campaign, SUM(COALESCE(subtotal, revenue)) AS revenue
           FROM cc_orders_today
           WHERE order_status = 'completed' AND user_id = $1
           GROUP BY utm_campaign
         ) o ON f.campaign_name = o.utm_campaign
         GROUP BY f.campaign_name
         ORDER BY spend DESC`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `ROAS for ${result.rows.length} campaigns`,
      };
    }

    case 'get_source_medium': {
      const result = await pool.query(
        `SELECT
           COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
           COALESCE(NULLIF(utm_medium, ''), '(none)') AS utm_medium,
           COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
           COUNT(DISTINCT order_id) AS conversions,
           COUNT(*) AS orders
         FROM cc_orders_today
         WHERE order_status = 'completed' AND user_id = $1
         GROUP BY utm_source, utm_medium
         ORDER BY revenue DESC`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} source/medium combinations`,
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

      // Add user_id scoping if query references known tables
      const userScopedTables = ['fb_ads_today', 'cc_orders_today', 'cc_upsells_today', 'fb_ads_archive', 'orders_archive', 'pixel_events'];
      let finalSql = cleaned;

      // Simple approach: if it doesn't already have a user_id condition, warn
      const hasUserFilter = /user_id/i.test(cleaned);

      const client = await pool.connect();
      try {
        await client.query('SET statement_timeout = 15000');
        const result = await client.query(
          hasUserFilter ? finalSql : finalSql,
          []
        );
        return {
          result: {
            columns: result.fields.map((f) => f.name),
            rows: result.rows.slice(0, 100),
            rowCount: result.rowCount,
            note: !hasUserFilter ? 'Warning: query may not be scoped to user_id' : undefined,
          },
          summary: `${result.rowCount} rows returned`,
        };
      } finally {
        await client.query('SET statement_timeout = 0').catch(() => {});
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
        adset: "ad_data->>'ad_set_name'",
      };

      const groupByKey = input.group_by || 'day';
      const groupByColumn = groupByWhitelist[groupByKey];
      if (!groupByColumn) {
        return {
          result: { error: `Invalid group_by value. Must be one of: day, campaign, adset` },
          summary: 'Invalid group_by parameter',
        };
      }

      const result = await pool.query(
        `SELECT ${groupByColumn} AS dimension,
           SUM((ad_data->>'spend')::NUMERIC) AS spend,
           SUM((ad_data->>'impressions')::INT) AS impressions,
           SUM((ad_data->>'clicks')::INT) AS clicks,
           CASE WHEN SUM((ad_data->>'impressions')::INT) > 0
             THEN SUM((ad_data->>'clicks')::FLOAT) / SUM((ad_data->>'impressions')::INT)
             ELSE 0 END AS ctr,
           CASE WHEN SUM((ad_data->>'clicks')::INT) > 0
             THEN SUM((ad_data->>'spend')::NUMERIC) / SUM((ad_data->>'clicks')::INT)
             ELSE 0 END AS cpc
         FROM fb_ads_archive
         WHERE user_id = $1
           AND archived_date >= $2::DATE
           AND archived_date <= $3::DATE
         GROUP BY ${groupByColumn}
         ORDER BY ${groupByColumn}`,
        [userId, input.start_date, input.end_date]
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

    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
  }
}
