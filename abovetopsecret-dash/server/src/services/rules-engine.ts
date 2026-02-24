import pool from '../db';
import { getSetting } from './settings';
import {
  pauseAdset,
  enableAdset,
  adjustBudget,
  increaseBudget,
  decreaseBudget,
  updateCampaignStatus,
  metaApiGet,
} from './meta-api';
import {
  pauseTikTokAdGroup,
  enableTikTokAdGroup,
  adjustTikTokBudget,
  increaseTikTokBudget,
  decreaseTikTokBudget,
  updateTikTokCampaignStatus,
} from './tiktok-api';
import { CheckoutChampClient } from './checkout-champ-client';
import { getRealtime } from './realtime';
import { sendEmail, buildRuleAlertEmail } from './email';

// ── Types ──────────────────────────────────────────────────────

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

interface PlatformMetrics {
  spend: number;
  clicks: number;
  impressions: number;
}

interface FullMetrics {
  [key: string]: number;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cvr: number;
  aov: number;
  profit: number;
  profit_margin: number;
}

// ── Metrics Collection ─────────────────────────────────────────

async function getGlobalMetrics(userId: number): Promise<FullMetrics> {
  const adsResult = await pool.query(`
    WITH all_ads AS (
      SELECT spend, clicks, impressions FROM fb_ads_today WHERE user_id = $1
      UNION ALL
      SELECT spend, clicks, impressions FROM tiktok_ads_today WHERE user_id = $1
      UNION ALL
      SELECT spend, clicks, impressions FROM newsbreak_ads_today WHERE user_id = $1
    )
    SELECT
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(clicks), 0) AS total_clicks,
      COALESCE(SUM(impressions), 0) AS total_impressions
    FROM all_ads
  `, [userId]);

  const ordersResult = await pool.query(`
    SELECT
      COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
      COUNT(DISTINCT order_id) AS total_conversions
    FROM cc_orders_today
    WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1
  `, [userId]);

  return buildFullMetrics(adsResult.rows[0], ordersResult.rows[0]);
}

async function getPlatformMetrics(userId: number, platform: string): Promise<FullMetrics> {
  let adsTable: string;
  let orderSource: string | null = null;

  switch (platform) {
    case 'meta':
      adsTable = 'fb_ads_today';
      break;
    case 'tiktok':
      adsTable = 'tiktok_ads_today';
      break;
    case 'newsbreak':
      adsTable = 'newsbreak_ads_today';
      orderSource = 'newsbreak';
      break;
    default:
      return getGlobalMetrics(userId);
  }

  const adsResult = await pool.query(`
    SELECT
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(clicks), 0) AS total_clicks,
      COALESCE(SUM(impressions), 0) AS total_impressions
    FROM ${adsTable}
    WHERE user_id = $1
  `, [userId]);

  // For order-side metrics, filter by source if applicable
  const orderQuery = orderSource
    ? `SELECT
        COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
        COUNT(DISTINCT order_id) AS total_conversions
       FROM cc_orders_today
       WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL)
         AND user_id = $1 AND source = $2`
    : `SELECT
        COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
        COUNT(DISTINCT order_id) AS total_conversions
       FROM cc_orders_today
       WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL)
         AND user_id = $1`;

  const ordersResult = orderSource
    ? await pool.query(orderQuery, [userId, orderSource])
    : await pool.query(orderQuery, [userId]);

  return buildFullMetrics(adsResult.rows[0], ordersResult.rows[0]);
}

async function getCampaignMetrics(userId: number, platform: string, campaignPattern: string): Promise<FullMetrics> {
  let adsTable: string;
  let campaignCol = 'campaign_name';

  switch (platform) {
    case 'meta':
      adsTable = 'fb_ads_today';
      break;
    case 'tiktok':
      adsTable = 'tiktok_ads_today';
      break;
    case 'newsbreak':
      adsTable = 'newsbreak_ads_today';
      break;
    default:
      adsTable = 'fb_ads_today';
      break;
  }

  // Support both exact match and ILIKE pattern
  const isPattern = campaignPattern.includes('%') || campaignPattern.includes('*');
  const likePattern = isPattern ? campaignPattern.replace(/\*/g, '%') : campaignPattern;
  const matchClause = isPattern ? `${campaignCol} ILIKE $2` : `${campaignCol} = $2`;

  const adsResult = await pool.query(`
    SELECT
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(clicks), 0) AS total_clicks,
      COALESCE(SUM(impressions), 0) AS total_impressions
    FROM ${adsTable}
    WHERE user_id = $1 AND ${matchClause}
  `, [userId, likePattern]);

  // For campaign-level, use UTM matching for orders
  const ordersResult = await pool.query(`
    SELECT
      COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
      COUNT(DISTINCT order_id) AS total_conversions
    FROM cc_orders_today
    WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL)
      AND user_id = $1
      AND (utm_campaign ILIKE $2 OR offer_name ILIKE $2)
  `, [userId, likePattern]);

  return buildFullMetrics(adsResult.rows[0], ordersResult.rows[0]);
}

function buildFullMetrics(
  ads: { total_spend: string; total_clicks: string; total_impressions: string },
  orders: { total_revenue: string; total_conversions: string }
): FullMetrics {
  const spend = parseFloat(ads.total_spend) || 0;
  const revenue = parseFloat(orders.total_revenue) || 0;
  const conversions = parseInt(orders.total_conversions as string) || 0;
  const clicks = parseInt(ads.total_clicks as string) || 0;
  const impressions = parseInt(ads.total_impressions as string) || 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;
  const profit = revenue - spend;
  const profit_margin = revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0;

  return { spend, revenue, roas, cpa, conversions, clicks, impressions, ctr, cvr, aov, profit, profit_margin };
}

// ── Rule Evaluation ────────────────────────────────────────────

export async function evaluateRules(userId: number): Promise<void> {
  try {
    const rulesResult = await pool.query(
      'SELECT * FROM automation_rules WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    const rules: Rule[] = rulesResult.rows;
    if (rules.length === 0) return;

    // Cache metrics per scope to avoid redundant queries
    const metricsCache: Record<string, FullMetrics> = {};

    for (const rule of rules) {
      try {
        // Cooldown check
        if (rule.cooldown_minutes > 0 && rule.last_fired_at) {
          const lastFired = new Date(rule.last_fired_at).getTime();
          const cooldownMs = rule.cooldown_minutes * 60 * 1000;
          if (Date.now() - lastFired < cooldownMs) {
            continue;
          }
        }

        const metrics = await getMetricsForRule(userId, rule, metricsCache);
        const triggered = evaluateCondition(rule, metrics);

        if (triggered) {
          const actionDetail = await executeAction(rule, metrics, userId);

          await pool.query(
            'UPDATE automation_rules SET last_fired_at = NOW() WHERE id = $1',
            [rule.id]
          );

          await pool.query(
            `INSERT INTO rule_execution_log (rule_id, trigger_data, action_result, action_detail, status, user_id)
             VALUES ($1, $2, $3, $4, 'success', $5)`,
            [rule.id, JSON.stringify(metrics), JSON.stringify({ action: rule.action_type }), JSON.stringify(actionDetail), userId]
          );

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
          [rule.id, JSON.stringify({}), message, JSON.stringify({ error: message }), userId]
        );
      }
    }
  } catch (err) {
    console.error(`[Rules Engine] Error evaluating rules for user ${userId}:`, err);
  }
}

async function getMetricsForRule(
  userId: number,
  rule: Rule,
  cache: Record<string, FullMetrics>
): Promise<FullMetrics> {
  const config = rule.trigger_config;
  const platform = config.platform || 'all';
  const campaignName = config.campaign_name || '';

  let cacheKey: string;

  if (campaignName) {
    cacheKey = `${platform}:${campaignName}`;
    if (!cache[cacheKey]) {
      cache[cacheKey] = await getCampaignMetrics(userId, platform, campaignName);
    }
  } else if (platform !== 'all') {
    cacheKey = platform;
    if (!cache[cacheKey]) {
      cache[cacheKey] = await getPlatformMetrics(userId, platform);
    }
  } else {
    cacheKey = 'global';
    if (!cache[cacheKey]) {
      cache[cacheKey] = await getGlobalMetrics(userId);
    }
  }

  return cache[cacheKey];
}

// ── Condition Evaluation ───────────────────────────────────────

function evaluateCondition(rule: Rule, metrics: FullMetrics): boolean {
  const config = rule.trigger_config;

  if (rule.trigger_type === 'metric_threshold') {
    return evaluateSingleCondition(config, metrics);
  }

  if (rule.trigger_type === 'compound') {
    const logic: 'AND' | 'OR' = config.logic || 'AND';
    const conditions: any[] = config.conditions || [];
    if (conditions.length === 0) return false;

    if (logic === 'AND') {
      return conditions.every((c: any) => evaluateSingleCondition(c, metrics));
    } else {
      return conditions.some((c: any) => evaluateSingleCondition(c, metrics));
    }
  }

  return false;
}

function evaluateSingleCondition(condition: any, metrics: FullMetrics): boolean {
  const metricValue = (metrics as any)[condition.metric];
  if (metricValue === undefined) return false;

  const threshold = parseFloat(condition.value);
  switch (condition.operator) {
    case '>': return metricValue > threshold;
    case '<': return metricValue < threshold;
    case '>=': return metricValue >= threshold;
    case '<=': return metricValue <= threshold;
    case '=': return metricValue === threshold;
    default: return false;
  }
}

// ── Action Execution ───────────────────────────────────────────

async function executeAction(rule: Rule, metrics: FullMetrics, userId: number): Promise<any> {
  const config = rule.action_config;
  const meta = rule.action_meta || {};

  switch (rule.action_type) {
    // ── Notification Actions ──────────────────────────────────
    case 'notification':
      return await executeNotification(rule, metrics, userId);

    case 'flag_review':
      return await executeFlagReview(rule, metrics, userId);

    case 'slack_notify':
      return await executeSlackNotify(rule, metrics, userId);

    case 'email_notify':
      return await executeEmailNotify(rule, metrics, userId);

    case 'webhook':
      return await executeWebhookWithRetry(rule, metrics);

    // ── Meta Actions ──────────────────────────────────────────
    case 'pause_adset':
      return await executeMetaAdsetAction('pause', rule, userId);

    case 'enable_adset':
      return await executeMetaAdsetAction('enable', rule, userId);

    case 'adjust_budget':
      return await executeMetaAdjustBudget(rule, userId);

    case 'increase_budget_pct':
      return await executeMetaBudgetPercent('increase', rule, userId);

    case 'decrease_budget_pct':
      return await executeMetaBudgetPercent('decrease', rule, userId);

    case 'pause_campaign':
      return await executeMetaCampaignStatus('PAUSED', rule, userId);

    case 'enable_campaign':
      return await executeMetaCampaignStatus('ACTIVE', rule, userId);

    // ── TikTok Actions ────────────────────────────────────────
    case 'pause_tiktok_adgroup':
      return await executeTikTokAdGroupAction('pause', rule, userId);

    case 'enable_tiktok_adgroup':
      return await executeTikTokAdGroupAction('enable', rule, userId);

    case 'adjust_tiktok_budget':
      return await executeTikTokAdjustBudget(rule, userId);

    case 'increase_tiktok_budget_pct':
      return await executeTikTokBudgetPercent('increase', rule, userId);

    case 'decrease_tiktok_budget_pct':
      return await executeTikTokBudgetPercent('decrease', rule, userId);

    case 'pause_tiktok_campaign':
      return await executeTikTokCampaignStatus('DISABLE', rule, userId);

    case 'enable_tiktok_campaign':
      return await executeTikTokCampaignStatus('ENABLE', rule, userId);

    // ── Checkout Champ Actions ────────────────────────────────
    case 'pause_cc_subscription':
      return await executeCCPauseSubscription(rule, userId);

    case 'cancel_cc_subscription':
      return await executeCCCancelSubscription(rule, userId);

    default:
      return { type: rule.action_type, status: 'unknown_action' };
  }
}

// ── Notification Action Handlers ───────────────────────────────

async function executeNotification(rule: Rule, metrics: FullMetrics, userId: number): Promise<any> {
  const config = rule.action_config;
  const title = `Rule triggered: ${rule.name}`;
  const message = config.message || `Automation rule "${rule.name}" was triggered based on current metrics.`;
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, 'rule_alert', $2, $3, $4)`,
    [userId, title, message, JSON.stringify({ rule_id: rule.id, metrics })]
  );
  getRealtime()?.emitNotification(userId, { title, message });
  return { type: 'notification', delivered: true };
}

async function executeFlagReview(rule: Rule, metrics: FullMetrics, userId: number): Promise<any> {
  const config = rule.action_config;
  const title = `Review needed: ${rule.name}`;
  const message = config.message || `A campaign has been flagged for review by rule "${rule.name}".`;
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, 'review_flag', $2, $3, $4)`,
    [userId, title, message, JSON.stringify({ rule_id: rule.id, metrics })]
  );
  getRealtime()?.emitNotification(userId, { title, message });
  return { type: 'flag_review', delivered: true };
}

async function executeSlackNotify(rule: Rule, metrics: FullMetrics, userId: number): Promise<any> {
  const slackUrl = await getSlackWebhookUrl(userId);
  if (!slackUrl) throw new Error('No Slack webhook URL configured');
  await sendSlackNotification(slackUrl, rule, metrics);
  return { type: 'slack_notify', delivered: true };
}

async function executeEmailNotify(rule: Rule, metrics: FullMetrics, userId: number): Promise<any> {
  const emailAddress = await getUserEmail(userId);
  if (!emailAddress) throw new Error('No email address found for user');
  const { subject, html } = buildRuleAlertEmail(rule.name, metrics, rule.action_type);
  const sent = await sendEmail({ to: emailAddress, subject, html });
  if (!sent) throw new Error('Email delivery failed or SMTP not configured');
  return { type: 'email_notify', delivered: true, to: emailAddress };
}

// ── Meta Action Handlers ───────────────────────────────────────

async function getMetaToken(userId: number): Promise<string> {
  const accessToken = await getSetting('fb_access_token', userId);
  if (!accessToken) throw new Error('No Meta access token configured');
  return accessToken;
}

function getTargetId(rule: Rule, field: string): string {
  const meta = rule.action_meta || {};
  const config = rule.action_config || {};
  const id = meta[field] || config[field];
  if (!id) throw new Error(`No ${field} configured for ${rule.action_type} action`);
  return id;
}

async function executeMetaAdsetAction(action: 'pause' | 'enable', rule: Rule, userId: number): Promise<any> {
  const accessToken = await getMetaToken(userId);
  const adsetId = getTargetId(rule, 'adset_id');
  const fn = action === 'pause' ? pauseAdset : enableAdset;
  const result = await fn(adsetId, accessToken);
  return { type: `${action}_adset`, adset_id: adsetId, result };
}

async function executeMetaAdjustBudget(rule: Rule, userId: number): Promise<any> {
  const accessToken = await getMetaToken(userId);
  const adsetId = getTargetId(rule, 'adset_id');
  const meta = rule.action_meta || {};
  const config = rule.action_config || {};
  const budget = meta.budget || config.budget;
  if (!budget) throw new Error('No budget configured for adjust_budget action');
  const budgetCents = Math.round(parseFloat(budget) * 100);
  const result = await adjustBudget(adsetId, budgetCents, accessToken);
  return { type: 'adjust_budget', adset_id: adsetId, budget, result };
}

async function executeMetaBudgetPercent(direction: 'increase' | 'decrease', rule: Rule, userId: number): Promise<any> {
  const accessToken = await getMetaToken(userId);
  const adsetId = getTargetId(rule, 'adset_id');
  const meta = rule.action_meta || {};
  const config = rule.action_config || {};
  const percent = parseFloat(meta.percent || config.percent);
  if (!percent || percent <= 0) throw new Error(`No percent configured for ${direction}_budget_pct action`);
  const fn = direction === 'increase' ? increaseBudget : decreaseBudget;
  const result = await fn(adsetId, percent, accessToken);
  return { type: `${direction}_budget_pct`, adset_id: adsetId, percent, result };
}

async function executeMetaCampaignStatus(status: 'ACTIVE' | 'PAUSED', rule: Rule, userId: number): Promise<any> {
  const accessToken = await getMetaToken(userId);
  const campaignId = getTargetId(rule, 'campaign_id');
  const result = await updateCampaignStatus(campaignId, status, accessToken);
  return { type: status === 'PAUSED' ? 'pause_campaign' : 'enable_campaign', campaign_id: campaignId, result };
}

// ── TikTok Action Handlers ─────────────────────────────────────

async function executeTikTokAdGroupAction(action: 'pause' | 'enable', rule: Rule, userId: number): Promise<any> {
  const adGroupId = getTargetId(rule, 'adgroup_id');
  const fn = action === 'pause' ? pauseTikTokAdGroup : enableTikTokAdGroup;
  const result = await fn(adGroupId, userId);
  return { type: `${action}_tiktok_adgroup`, adgroup_id: adGroupId, result };
}

async function executeTikTokAdjustBudget(rule: Rule, userId: number): Promise<any> {
  const adGroupId = getTargetId(rule, 'adgroup_id');
  const meta = rule.action_meta || {};
  const config = rule.action_config || {};
  const budget = parseFloat(meta.budget || config.budget);
  if (!budget) throw new Error('No budget configured for adjust_tiktok_budget action');
  const result = await adjustTikTokBudget(adGroupId, budget, userId);
  return { type: 'adjust_tiktok_budget', adgroup_id: adGroupId, budget, result };
}

async function executeTikTokBudgetPercent(direction: 'increase' | 'decrease', rule: Rule, userId: number): Promise<any> {
  const adGroupId = getTargetId(rule, 'adgroup_id');
  const meta = rule.action_meta || {};
  const config = rule.action_config || {};
  const percent = parseFloat(meta.percent || config.percent);
  if (!percent || percent <= 0) throw new Error(`No percent configured for ${direction}_tiktok_budget_pct action`);
  const fn = direction === 'increase' ? increaseTikTokBudget : decreaseTikTokBudget;
  const result = await fn(adGroupId, percent, userId);
  return { type: `${direction}_tiktok_budget_pct`, adgroup_id: adGroupId, percent, result };
}

async function executeTikTokCampaignStatus(status: 'ENABLE' | 'DISABLE', rule: Rule, userId: number): Promise<any> {
  const campaignId = getTargetId(rule, 'campaign_id');
  const result = await updateTikTokCampaignStatus(campaignId, status, userId);
  return { type: status === 'DISABLE' ? 'pause_tiktok_campaign' : 'enable_tiktok_campaign', campaign_id: campaignId, result };
}

// ── Checkout Champ Action Handlers ─────────────────────────────

async function executeCCPauseSubscription(rule: Rule, userId: number): Promise<any> {
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) throw new Error('No Checkout Champ credentials configured');
  const purchaseId = getTargetId(rule, 'purchase_id');
  const result = await client.pausePurchase(purchaseId);
  return { type: 'pause_cc_subscription', purchase_id: purchaseId, result: result.result };
}

async function executeCCCancelSubscription(rule: Rule, userId: number): Promise<any> {
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) throw new Error('No Checkout Champ credentials configured');
  const purchaseId = getTargetId(rule, 'purchase_id');
  const meta = rule.action_meta || {};
  const reason = meta.cancel_reason || 'Cancelled by automation rule';
  const result = await client.cancelPurchase(purchaseId, reason);
  return { type: 'cancel_cc_subscription', purchase_id: purchaseId, result: result.result };
}

// ── Webhook Handler ────────────────────────────────────────────

async function executeWebhookWithRetry(rule: Rule, metrics: FullMetrics): Promise<any> {
  const config = rule.action_config;
  const url = config.url || config.webhook_url;
  if (!url) throw new Error('No webhook URL configured');

  const maxAttempts = 3;
  const delays = [1000, 2000, 4000];
  const attempts: any[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
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

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Webhook returned client error ${response.status}, not retrying: ${JSON.stringify(attempts)}`);
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    } catch (err: any) {
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

// ── Slack Notification ─────────────────────────────────────────

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
  metrics: FullMetrics
): Promise<void> {
  const triggerConfig = rule.trigger_config || {};
  const platformLabel = triggerConfig.platform && triggerConfig.platform !== 'all'
    ? ` (${triggerConfig.platform.toUpperCase()})`
    : '';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Rule Triggered: ${rule.name}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Spend:* $${metrics.spend?.toFixed(2) || '0'}${platformLabel}` },
          { type: 'mrkdwn', text: `*Revenue:* $${metrics.revenue?.toFixed(2) || '0'}` },
          { type: 'mrkdwn', text: `*ROAS:* ${metrics.roas?.toFixed(2) || '0'}x` },
          { type: 'mrkdwn', text: `*CPA:* $${metrics.cpa?.toFixed(2) || '0'}` },
          { type: 'mrkdwn', text: `*CTR:* ${metrics.ctr?.toFixed(2) || '0'}%` },
          { type: 'mrkdwn', text: `*CVR:* ${metrics.cvr?.toFixed(2) || '0'}%` },
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

// ── Helpers ────────────────────────────────────────────────────

async function getUserEmail(userId: number): Promise<string | null> {
  try {
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.email || null;
  } catch {
    return null;
  }
}
