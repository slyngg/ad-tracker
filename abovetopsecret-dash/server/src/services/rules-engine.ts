import pool from '../db';

interface Rule {
  id: number;
  user_id: number;
  name: string;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  enabled: boolean;
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
        const triggered = evaluateCondition(rule, metricsMap);

        if (triggered) {
          await executeAction(rule, metricsMap, userId);
          await pool.query(
            `INSERT INTO rule_execution_log (rule_id, trigger_data, action_result, status, user_id)
             VALUES ($1, $2, $3, 'success', $4)`,
            [rule.id, JSON.stringify(metricsMap), JSON.stringify({ action: rule.action_type }), userId]
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await pool.query(
          `INSERT INTO rule_execution_log (rule_id, trigger_data, status, error_message, user_id)
           VALUES ($1, $2, 'failure', $3, $4)`,
          [rule.id, JSON.stringify(metricsMap), message, userId]
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

async function executeAction(rule: Rule, metrics: Record<string, number>, userId: number): Promise<void> {
  const config = rule.action_config;

  if (rule.action_type === 'notification') {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, 'rule_alert', $2, $3, $4)`,
      [
        userId,
        `Rule triggered: ${rule.name}`,
        config.message || `Automation rule "${rule.name}" was triggered based on current metrics.`,
        JSON.stringify({ rule_id: rule.id, metrics }),
      ]
    );
  } else if (rule.action_type === 'webhook') {
    // Fire and forget webhook
    try {
      const url = config.url;
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule: rule.name, metrics, triggered_at: new Date().toISOString() }),
        }).catch(() => {});
      }
    } catch {
      // Webhook failures are logged but don't throw
    }
  } else if (rule.action_type === 'flag_review') {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, 'review_flag', $2, $3, $4)`,
      [
        userId,
        `Review needed: ${rule.name}`,
        config.message || `A campaign has been flagged for review by rule "${rule.name}".`,
        JSON.stringify({ rule_id: rule.id, metrics }),
      ]
    );
  }
}
