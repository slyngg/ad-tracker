import pool from '../db';
import { getSetting } from './settings';
import { pauseAdset, enableAdset, adjustBudget } from './meta-api';
import { getRealtime } from './realtime';

interface Rule {
  id: number;
  user_id: number;
  name: string;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  action_meta: any;
  enabled: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
}

export async function evaluateRules(userId: number): Promise<void> {
  try {
    const rulesResult = await pool.query(
      'SELECT * FROM automation_rules WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    const rules: Rule[] = rulesResult.rows;
    if (rules.length === 0) return;

    // Get current metrics for this user
    const metricsResult = await pool.query(`
      SELECT
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(clicks), 0) AS total_clicks,
        COALESCE(SUM(impressions), 0) AS total_impressions
      FROM fb_ads_today WHERE user_id = $1
    `, [userId]);

    const ordersResult = await pool.query(`
      SELECT
        COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
        COUNT(DISTINCT order_id) AS total_conversions
      FROM cc_orders_today WHERE order_status = 'completed' AND user_id = $1
    `, [userId]);

    const ads = metricsResult.rows[0];
    const orders = ordersResult.rows[0];
    const spend = parseFloat(ads.total_spend) || 0;
    const revenue = parseFloat(orders.total_revenue) || 0;
    const conversions = parseInt(orders.total_conversions) || 0;
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;

    const metricsMap: Record<string, number> = {
      spend, revenue, roas, cpa, conversions,
      clicks: parseInt(ads.total_clicks) || 0,
      impressions: parseInt(ads.total_impressions) || 0,
    };

    for (const rule of rules) {
      try {
        // Cooldown check
        if (rule.cooldown_minutes > 0 && rule.last_fired_at) {
          const lastFired = new Date(rule.last_fired_at).getTime();
          const cooldownMs = rule.cooldown_minutes * 60 * 1000;
          if (Date.now() - lastFired < cooldownMs) {
            // Still in cooldown, skip
            continue;
          }
        }

        const triggered = evaluateCondition(rule, metricsMap);

        if (triggered) {
          const actionDetail = await executeAction(rule, metricsMap, userId);

          // Update last_fired_at
          await pool.query(
            'UPDATE automation_rules SET last_fired_at = NOW() WHERE id = $1',
            [rule.id]
          );

          await pool.query(
            `INSERT INTO rule_execution_log (rule_id, trigger_data, action_result, action_detail, status, user_id)
             VALUES ($1, $2, $3, $4, 'success', $5)`,
            [rule.id, JSON.stringify(metricsMap), JSON.stringify({ action: rule.action_type }), JSON.stringify(actionDetail), userId]
          );

          // Emit real-time rule execution event
          getRealtime()?.emitRuleExecution(userId, {
            ruleId: rule.id,
            ruleName: rule.name,
            action: rule.action_type,
            detail: actionDetail,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await pool.query(
          `INSERT INTO rule_execution_log (rule_id, trigger_data, status, error_message, action_detail, user_id)
           VALUES ($1, $2, 'failure', $3, $4, $5)`,
          [rule.id, JSON.stringify(metricsMap), message, JSON.stringify({ error: message }), userId]
        );
      }
    }
  } catch (err) {
    console.error(`[Rules Engine] Error evaluating rules for user ${userId}:`, err);
  }
}

function evaluateCondition(rule: Rule, metrics: Record<string, number>): boolean {
  const config = rule.trigger_config;

  if (rule.trigger_type === 'metric_threshold') {
    const metricValue = metrics[config.metric];
    if (metricValue === undefined) return false;

    const threshold = parseFloat(config.value);
    switch (config.operator) {
      case '>': return metricValue > threshold;
      case '<': return metricValue < threshold;
      case '>=': return metricValue >= threshold;
      case '<=': return metricValue <= threshold;
      case '=': return metricValue === threshold;
      default: return false;
    }
  }

  return false;
}

async function executeAction(rule: Rule, metrics: Record<string, number>, userId: number): Promise<any> {
  const config = rule.action_config;
  const actionMeta = rule.action_meta || {};

  if (rule.action_type === 'notification') {
    const title = `Rule triggered: ${rule.name}`;
    const message = config.message || `Automation rule "${rule.name}" was triggered based on current metrics.`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, 'rule_alert', $2, $3, $4)`,
      [userId, title, message, JSON.stringify({ rule_id: rule.id, metrics })]
    );
    getRealtime()?.emitNotification(userId, { title, message });
    return { type: 'notification', delivered: true };

  } else if (rule.action_type === 'webhook') {
    return await executeWebhookWithRetry(rule, metrics);

  } else if (rule.action_type === 'flag_review') {
    const title = `Review needed: ${rule.name}`;
    const message = config.message || `A campaign has been flagged for review by rule "${rule.name}".`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, 'review_flag', $2, $3, $4)`,
      [userId, title, message, JSON.stringify({ rule_id: rule.id, metrics })]
    );
    getRealtime()?.emitNotification(userId, { title, message });
    return { type: 'flag_review', delivered: true };

  } else if (rule.action_type === 'pause_adset') {
    const accessToken = await getSetting('fb_access_token', userId);
    if (!accessToken) throw new Error('No Meta access token configured');
    const adsetId = actionMeta.adset_id || config.adset_id;
    if (!adsetId) throw new Error('No adset_id configured for pause_adset action');
    const result = await pauseAdset(adsetId, accessToken);
    return { type: 'pause_adset', adset_id: adsetId, result };

  } else if (rule.action_type === 'enable_adset') {
    const accessToken = await getSetting('fb_access_token', userId);
    if (!accessToken) throw new Error('No Meta access token configured');
    const adsetId = actionMeta.adset_id || config.adset_id;
    if (!adsetId) throw new Error('No adset_id configured for enable_adset action');
    const result = await enableAdset(adsetId, accessToken);
    return { type: 'enable_adset', adset_id: adsetId, result };

  } else if (rule.action_type === 'adjust_budget') {
    const accessToken = await getSetting('fb_access_token', userId);
    if (!accessToken) throw new Error('No Meta access token configured');
    const adsetId = actionMeta.adset_id || config.adset_id;
    const budget = actionMeta.budget || config.budget;
    if (!adsetId) throw new Error('No adset_id configured for adjust_budget action');
    if (!budget) throw new Error('No budget configured for adjust_budget action');
    const budgetCents = Math.round(parseFloat(budget) * 100);
    const result = await adjustBudget(adsetId, budgetCents, accessToken);
    return { type: 'adjust_budget', adset_id: adsetId, budget, result };

  } else if (rule.action_type === 'slack_notify') {
    const slackUrl = await getSlackWebhookUrl(userId);
    if (!slackUrl) throw new Error('No Slack webhook URL configured');
    await sendSlackNotification(slackUrl, rule, metrics);
    return { type: 'slack_notify', delivered: true };
  }

  return { type: rule.action_type, status: 'unknown_action' };
}

async function executeWebhookWithRetry(rule: Rule, metrics: Record<string, number>): Promise<any> {
  const config = rule.action_config;
  const url = config.url || config.webhook_url;
  if (!url) throw new Error('No webhook URL configured');

  const maxAttempts = 3;
  const delays = [1000, 2000, 4000]; // exponential backoff
  const attempts: any[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Per-request timeout of 10 seconds
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: rule.name,
            metrics,
            triggered_at: new Date().toISOString(),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      attempts.push({ attempt: attempt + 1, status: response.status, success: response.ok });

      if (response.ok) {
        return { type: 'webhook', attempts, delivered: true };
      }

      // 4xx errors are client errors — do not retry, throw immediately
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Webhook returned client error ${response.status}, not retrying: ${JSON.stringify(attempts)}`);
      }

      // 5xx errors — retry if not last attempt
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    } catch (err: any) {
      // Re-throw 4xx errors without retrying
      if (err.message?.includes('not retrying')) {
        throw err;
      }
      attempts.push({ attempt: attempt + 1, error: err.message });
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }

  throw new Error(`Webhook failed after ${maxAttempts} attempts: ${JSON.stringify(attempts)}`);
}

async function getSlackWebhookUrl(userId: number): Promise<string | null> {
  try {
    const result = await pool.query(
      'SELECT slack_webhook_url FROM notification_preferences WHERE user_id = $1 AND slack_webhook_url IS NOT NULL LIMIT 1',
      [userId]
    );
    return result.rows[0]?.slack_webhook_url || null;
  } catch {
    return null;
  }
}

async function sendSlackNotification(
  webhookUrl: string,
  rule: Rule,
  metrics: Record<string, number>
): Promise<void> {
  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Rule Triggered: ${rule.name}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Spend:* $${metrics.spend?.toFixed(2) || '0'}` },
          { type: 'mrkdwn', text: `*Revenue:* $${metrics.revenue?.toFixed(2) || '0'}` },
          { type: 'mrkdwn', text: `*ROAS:* ${metrics.roas?.toFixed(2) || '0'}x` },
          { type: 'mrkdwn', text: `*CPA:* $${metrics.cpa?.toFixed(2) || '0'}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Triggered at ${new Date().toISOString()} | Action: ${rule.action_type}` },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status}`);
  }
}
