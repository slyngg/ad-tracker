import { randomUUID } from 'crypto';
import pool from '../db';
import { getSetting } from './settings';
import { pauseAdset, enableAdset, adjustBudget, increaseBudget, decreaseBudget, updateCampaignStatus } from './meta-api';
import {
  pauseTikTokAdGroup,
  enableTikTokAdGroup,
  adjustTikTokBudget,
  increaseTikTokBudget,
  decreaseTikTokBudget,
  updateTikTokCampaignStatus,
} from './tiktok-api';
import { CheckoutChampClient } from './checkout-champ-client';
import { getRealtime } from '../services/realtime';

// ═══════════════════════════════════════════════════════════════
// CONFIRMATION GATE — write actions require explicit user confirmation
// ═══════════════════════════════════════════════════════════════

const WRITE_ACTIONS = new Set([
  'pause_adset', 'pause_meta_adset', 'enable_adset', 'enable_meta_adset',
  'adjust_budget', 'adjust_meta_budget',
  'pause_meta_campaign', 'enable_meta_campaign',
  'pause_tiktok_adgroup', 'enable_tiktok_adgroup',
  'adjust_tiktok_budget',
  'pause_tiktok_campaign', 'enable_tiktok_campaign',
  'pause_cc_subscription', 'cancel_cc_subscription',
]);

interface PendingAction {
  id: string;
  tool: string;
  input: Record<string, any>;
  userId: number | null;
  description: string;
  createdAt: number;
}

const pendingActions = new Map<string, PendingAction>();
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minute expiry

// Cleanup expired pending actions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, action] of pendingActions) {
    if (now - action.createdAt > PENDING_TTL_MS) {
      pendingActions.delete(id);
    }
  }
}, 60_000);

/** Get all non-expired pending actions for a specific user */
export function getPendingActionsForUser(userId: number | null): PendingAction[] {
  const now = Date.now();
  const actions: PendingAction[] = [];
  for (const [, action] of pendingActions) {
    if (action.userId === userId && now - action.createdAt < PENDING_TTL_MS) {
      actions.push(action);
    }
  }
  return actions;
}

// ═══════════════════════════════════════════════════════════════
// ID VALIDATION & FUZZY SUGGESTION
// ═══════════════════════════════════════════════════════════════

interface EntityLookup {
  table: string;
  idCol: string;
  nameCol: string;
  inputKey: string;     // key in the tool input (adset_id, campaign_id, adgroup_id)
  entityLabel: string;  // human label (Meta adset, TikTok ad group, etc.)
}

/** Map tool names to the entity they target */
function getEntityLookup(toolName: string): EntityLookup | null {
  const META_ADSET_TOOLS = ['pause_adset', 'pause_meta_adset', 'enable_adset', 'enable_meta_adset', 'adjust_budget', 'adjust_meta_budget'];
  const META_CAMPAIGN_TOOLS = ['pause_meta_campaign', 'enable_meta_campaign'];
  const TT_ADGROUP_TOOLS = ['pause_tiktok_adgroup', 'enable_tiktok_adgroup', 'adjust_tiktok_budget'];
  const TT_CAMPAIGN_TOOLS = ['pause_tiktok_campaign', 'enable_tiktok_campaign'];

  if (META_ADSET_TOOLS.includes(toolName))
    return { table: 'fb_ads_today', idCol: 'ad_set_id', nameCol: 'ad_set_name', inputKey: 'adset_id', entityLabel: 'Meta adset' };
  if (META_CAMPAIGN_TOOLS.includes(toolName))
    return { table: 'fb_ads_today', idCol: 'campaign_id', nameCol: 'campaign_name', inputKey: 'campaign_id', entityLabel: 'Meta campaign' };
  if (TT_ADGROUP_TOOLS.includes(toolName))
    return { table: 'tiktok_ads_today', idCol: 'adgroup_id', nameCol: 'adgroup_name', inputKey: 'adgroup_id', entityLabel: 'TikTok ad group' };
  if (TT_CAMPAIGN_TOOLS.includes(toolName))
    return { table: 'tiktok_ads_today', idCol: 'campaign_id', nameCol: 'campaign_name', inputKey: 'campaign_id', entityLabel: 'TikTok campaign' };
  return null; // CC subscriptions — can't validate locally
}

/** Validate an entity ID/name exists, resolve names to IDs, return fuzzy suggestions if not found */
async function validateEntityId(
  toolName: string,
  input: Record<string, any>,
  userId: number | null
): Promise<{ valid: boolean; entityName?: string; resolvedId?: string; suggestions?: { option: number; id: string; name: string; spend: string }[]; error?: string }> {
  if (!userId) return { valid: true };

  const lookup = getEntityLookup(toolName);
  if (!lookup) return { valid: true }; // CC or unknown — skip validation

  const idValue = input[lookup.inputKey];
  const nameValue = input.name;

  if (!idValue && !nameValue) {
    return {
      valid: false,
      error: `Please provide either the ${lookup.entityLabel} ID or name.`,
      suggestions: await getAllEntities(lookup, userId),
    };
  }

  // ── Path A: User provided an ID — validate it exists ──
  if (idValue) {
    const exact = await pool.query(
      `SELECT DISTINCT ${lookup.idCol} AS id, ${lookup.nameCol} AS name
       FROM ${lookup.table} WHERE user_id = $1 AND ${lookup.idCol}::TEXT = $2`,
      [userId, String(idValue)]
    );
    if (exact.rows.length > 0) {
      return { valid: true, entityName: exact.rows[0].name };
    }

    // ID not found — fuzzy search by partial ID or name
    const fuzzy = await pool.query(
      `SELECT ${lookup.idCol} AS id, ${lookup.nameCol} AS name, SUM(spend) AS spend
       FROM ${lookup.table}
       WHERE user_id = $1 AND (
         ${lookup.idCol}::TEXT LIKE '%' || $2 || '%'
         OR ${lookup.nameCol} ILIKE '%' || $2 || '%'
       )
       GROUP BY ${lookup.idCol}, ${lookup.nameCol}
       ORDER BY SUM(spend) DESC
       LIMIT 5`,
      [userId, String(idValue)]
    );
    if (fuzzy.rows.length > 0) {
      return {
        valid: false,
        suggestions: fuzzy.rows.map((r: any, i: number) => ({
          option: i + 1, id: r.id, name: r.name, spend: `$${parseFloat(r.spend || 0).toFixed(2)}`,
        })),
        error: `No ${lookup.entityLabel} found with ID "${idValue}". Did you mean one of these?`,
      };
    }

    // Nothing found at all
    return {
      valid: false,
      suggestions: await getAllEntities(lookup, userId),
      error: `No ${lookup.entityLabel} found matching "${idValue}". Here are your available ${lookup.entityLabel}s:`,
    };
  }

  // ── Path B: User provided a NAME — resolve to ID ──
  // Try exact name match first
  const exactName = await pool.query(
    `SELECT ${lookup.idCol} AS id, ${lookup.nameCol} AS name, SUM(spend) AS spend
     FROM ${lookup.table}
     WHERE user_id = $1 AND ${lookup.nameCol} ILIKE $2
     GROUP BY ${lookup.idCol}, ${lookup.nameCol}
     ORDER BY SUM(spend) DESC`,
    [userId, nameValue!.trim()]
  );
  if (exactName.rows.length === 1) {
    return { valid: true, entityName: exactName.rows[0].name, resolvedId: exactName.rows[0].id };
  }
  if (exactName.rows.length > 1) {
    // Multiple exact matches (same name, different IDs) — disambiguate
    return {
      valid: false,
      suggestions: exactName.rows.map((r: any, i: number) => ({
        option: i + 1, id: r.id, name: r.name, spend: `$${parseFloat(r.spend || 0).toFixed(2)}`,
      })),
      error: `Multiple ${lookup.entityLabel}s named "${nameValue}". Which one?`,
    };
  }

  // Try fuzzy name match (contains)
  const fuzzyName = await pool.query(
    `SELECT ${lookup.idCol} AS id, ${lookup.nameCol} AS name, SUM(spend) AS spend
     FROM ${lookup.table}
     WHERE user_id = $1 AND ${lookup.nameCol} ILIKE '%' || $2 || '%'
     GROUP BY ${lookup.idCol}, ${lookup.nameCol}
     ORDER BY SUM(spend) DESC
     LIMIT 5`,
    [userId, nameValue!.trim()]
  );
  if (fuzzyName.rows.length === 1) {
    return { valid: true, entityName: fuzzyName.rows[0].name, resolvedId: fuzzyName.rows[0].id };
  }
  if (fuzzyName.rows.length > 1) {
    return {
      valid: false,
      suggestions: fuzzyName.rows.map((r: any, i: number) => ({
        option: i + 1, id: r.id, name: r.name, spend: `$${parseFloat(r.spend || 0).toFixed(2)}`,
      })),
      error: `Multiple ${lookup.entityLabel}s match "${nameValue}". Which one did you mean?`,
    };
  }

  // No match at all
  return {
    valid: false,
    suggestions: await getAllEntities(lookup, userId),
    error: `No ${lookup.entityLabel} found matching "${nameValue}". Here are your available ${lookup.entityLabel}s:`,
  };
}

/** Helper: get all entities for a user (fallback when no match found) */
async function getAllEntities(lookup: EntityLookup, userId: number): Promise<{ option: number; id: string; name: string; spend: string }[]> {
  const all = await pool.query(
    `SELECT ${lookup.idCol} AS id, ${lookup.nameCol} AS name, SUM(spend) AS spend
     FROM ${lookup.table}
     WHERE user_id = $1
     GROUP BY ${lookup.idCol}, ${lookup.nameCol}
     ORDER BY SUM(spend) DESC
     LIMIT 10`,
    [userId]
  );
  return all.rows.map((r: any, i: number) => ({
    option: i + 1, id: r.id, name: r.name, spend: `$${parseFloat(r.spend || 0).toFixed(2)}`,
  }));
}

// ═══════════════════════════════════════════════════════════════
// ACTION DESCRIPTION BUILDER
// ═══════════════════════════════════════════════════════════════

function buildActionDescription(name: string, input: Record<string, any>, entityName?: string): string {
  const tag = entityName ? ` "${entityName}"` : '';
  switch (name) {
    case 'pause_adset':
    case 'pause_meta_adset':
      return `Pause Meta adset ${input.adset_id}${tag}`;
    case 'enable_adset':
    case 'enable_meta_adset':
      return `Enable Meta adset ${input.adset_id}${tag}`;
    case 'adjust_budget':
    case 'adjust_meta_budget':
      if (input.increase_percent != null) return `Increase Meta adset ${input.adset_id}${tag} budget by ${input.increase_percent}%`;
      if (input.decrease_percent != null) return `Decrease Meta adset ${input.adset_id}${tag} budget by ${input.decrease_percent}%`;
      return `Set Meta adset ${input.adset_id}${tag} daily budget to $${input.daily_budget}`;
    case 'pause_meta_campaign':
      return `Pause Meta campaign ${input.campaign_id}${tag}`;
    case 'enable_meta_campaign':
      return `Enable Meta campaign ${input.campaign_id}${tag}`;
    case 'pause_tiktok_adgroup':
      return `Pause TikTok ad group ${input.adgroup_id}${tag}`;
    case 'enable_tiktok_adgroup':
      return `Enable TikTok ad group ${input.adgroup_id}${tag}`;
    case 'adjust_tiktok_budget':
      if (input.increase_percent != null) return `Increase TikTok ad group ${input.adgroup_id}${tag} budget by ${input.increase_percent}%`;
      if (input.decrease_percent != null) return `Decrease TikTok ad group ${input.adgroup_id}${tag} budget by ${input.decrease_percent}%`;
      return `Set TikTok ad group ${input.adgroup_id}${tag} daily budget to $${input.daily_budget}`;
    case 'pause_tiktok_campaign':
      return `Pause TikTok campaign ${input.campaign_id}${tag}`;
    case 'enable_tiktok_campaign':
      return `Enable TikTok campaign ${input.campaign_id}${tag}`;
    case 'pause_cc_subscription':
      return `Pause Checkout Champ subscription ${input.purchase_id}`;
    case 'cancel_cc_subscription':
      return `Cancel Checkout Champ subscription ${input.purchase_id}${input.reason ? ` (reason: ${input.reason})` : ''}`;
    default:
      return `Execute ${name} with ${JSON.stringify(input)}`;
  }
}

// Anthropic tool-use format definitions
export const operatorTools = [
  // ═══════════════════════════════════════════════════════════════
  // METRICS & ANALYTICS TOOLS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'get_campaign_metrics',
    description: "Get today's campaign-level ad metrics (spend, clicks, impressions, CPC, CTR) grouped by campaign. Optionally filter by account or platform.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
        platform: { type: 'string', enum: ['meta', 'tiktok', 'newsbreak'], description: 'Filter to a specific ad platform' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_adset_metrics',
    description: "Get today's adset-level breakdown of ad metrics grouped by adset. Optionally filter by account or platform.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account_id: { type: 'number', description: 'Filter to a specific account ID' },
        platform: { type: 'string', enum: ['meta', 'tiktok', 'newsbreak'], description: 'Filter to a specific ad platform' },
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

  // ═══════════════════════════════════════════════════════════════
  // META (FACEBOOK) ADS ACTIONS
  // Users can reference entities by NAME (e.g. "Collagen - Broad") or ID.
  // The system resolves names to IDs automatically.
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'pause_meta_adset',
    description: 'Pause a Meta adset. Provide the adset_id OR the name — the system resolves names to IDs automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID (if known)' },
        name: { type: 'string', description: 'The adset name to search for (e.g. "Collagen Broad"). Used when the user refers to an adset by name instead of ID.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'enable_meta_adset',
    description: 'Enable a paused Meta adset. Provide the adset_id OR the name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID (if known)' },
        name: { type: 'string', description: 'The adset name to search for' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'adjust_meta_budget',
    description: 'Change the daily budget of a Meta adset. Provide the adset_id OR name, plus EITHER daily_budget (absolute $), OR increase_percent/decrease_percent (relative %).',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'The Meta adset ID (if known)' },
        name: { type: 'string', description: 'The adset name to search for' },
        daily_budget: { type: 'number', description: 'New daily budget in dollars (e.g. 50 for $50/day)' },
        increase_percent: { type: 'number', description: 'Increase budget by this percentage (e.g. 20 for +20%)' },
        decrease_percent: { type: 'number', description: 'Decrease budget by this percentage (e.g. 15 for -15%)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'pause_meta_campaign',
    description: 'Pause an entire Meta campaign. Provide the campaign_id OR the campaign name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'The Meta campaign ID (if known)' },
        name: { type: 'string', description: 'The campaign name to search for (e.g. "Collagen - Scale")' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'enable_meta_campaign',
    description: 'Enable a paused Meta campaign. Provide the campaign_id OR the campaign name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'The Meta campaign ID (if known)' },
        name: { type: 'string', description: 'The campaign name to search for' },
      },
      required: [] as string[],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TIKTOK ADS ACTIONS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'pause_tiktok_adgroup',
    description: 'Pause a TikTok ad group. Provide the adgroup_id OR the name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adgroup_id: { type: 'string', description: 'The TikTok ad group ID (if known)' },
        name: { type: 'string', description: 'The ad group name to search for' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'enable_tiktok_adgroup',
    description: 'Enable a paused TikTok ad group. Provide the adgroup_id OR the name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adgroup_id: { type: 'string', description: 'The TikTok ad group ID (if known)' },
        name: { type: 'string', description: 'The ad group name to search for' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'adjust_tiktok_budget',
    description: 'Change the daily budget of a TikTok ad group. Provide the adgroup_id OR name, plus EITHER daily_budget (absolute $, min $20), OR increase_percent/decrease_percent (relative %).',
    input_schema: {
      type: 'object' as const,
      properties: {
        adgroup_id: { type: 'string', description: 'The TikTok ad group ID (if known)' },
        name: { type: 'string', description: 'The ad group name to search for' },
        daily_budget: { type: 'number', description: 'New daily budget in dollars (min $20)' },
        increase_percent: { type: 'number', description: 'Increase budget by this percentage (e.g. 20 for +20%)' },
        decrease_percent: { type: 'number', description: 'Decrease budget by this percentage (e.g. 15 for -15%)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'pause_tiktok_campaign',
    description: 'Pause an entire TikTok campaign. Provide the campaign_id OR the campaign name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'The TikTok campaign ID (if known)' },
        name: { type: 'string', description: 'The campaign name to search for' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'enable_tiktok_campaign',
    description: 'Enable a paused TikTok campaign. Provide the campaign_id OR the campaign name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'The TikTok campaign ID (if known)' },
        name: { type: 'string', description: 'The campaign name to search for' },
      },
      required: [] as string[],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // CHECKOUT CHAMP ACTIONS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'pause_cc_subscription',
    description: 'Pause a Checkout Champ subscription/recurring purchase. The customer will not be billed until reactivated. Only use when the user explicitly asks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        purchase_id: { type: 'string', description: 'The Checkout Champ purchase/subscription ID to pause' },
      },
      required: ['purchase_id'],
    },
  },
  {
    name: 'cancel_cc_subscription',
    description: 'Cancel a Checkout Champ subscription/recurring purchase permanently. Only use when the user explicitly asks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        purchase_id: { type: 'string', description: 'The Checkout Champ purchase/subscription ID to cancel' },
        reason: { type: 'string', description: 'Reason for cancellation. Defaults to "Cancelled via operator".' },
      },
      required: ['purchase_id'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // SQL & DATA TOOLS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // AUTOMATION RULES TOOLS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'list_rules',
    description: 'List all automation rules for the current user with full details: trigger conditions, action type, platform scope, cooldown, status, and last execution time.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'create_rule',
    description: `Create a new automation rule. Supports metric threshold triggers (single or compound AND/OR conditions) with platform/campaign scoping, and actions across Meta, TikTok, Checkout Champ, and notifications.

Available metrics: spend, revenue, roas, cpa, conversions, clicks, impressions, ctr, cvr, aov, profit, profit_margin.
Available operators: >, <, >=, <=, =.
Platforms: all (default), meta, tiktok, newsbreak.

Available action_types:
  Notifications: notification, email_notify, slack_notify, webhook, flag_review
  Meta Ads: pause_adset, enable_adset, adjust_budget, increase_budget_pct, decrease_budget_pct, pause_campaign, enable_campaign
  TikTok Ads: pause_tiktok_adgroup, enable_tiktok_adgroup, adjust_tiktok_budget, increase_tiktok_budget_pct, decrease_tiktok_budget_pct, pause_tiktok_campaign, enable_tiktok_campaign
  Checkout Champ: pause_cc_subscription, cancel_cc_subscription`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the rule' },
        description: { type: 'string', description: 'Optional description of what this rule does' },
        trigger_type: {
          type: 'string',
          enum: ['metric_threshold', 'compound'],
          description: 'metric_threshold for single condition, compound for multiple AND/OR conditions. Defaults to metric_threshold.',
        },
        trigger_config: {
          type: 'object',
          description: `Trigger configuration. For metric_threshold: { metric, operator, value, platform?, campaign_name? }. For compound: { logic: "AND"|"OR", conditions: [{ metric, operator, value }], platform?, campaign_name? }. platform defaults to "all". campaign_name supports wildcards with *.`,
        },
        action_type: { type: 'string', description: 'The action to execute when the rule triggers. See available action_types in the tool description.' },
        action_config: {
          type: 'object',
          description: 'Action config — for notification/flag_review/email_notify: { message }. For webhook: { webhook_url }. For other actions: {}.',
        },
        action_meta: {
          type: 'object',
          description: `Action target IDs and parameters. For Meta adset actions: { adset_id }. For Meta campaign actions: { campaign_id }. For budget % actions: { adset_id/adgroup_id, percent }. For budget set actions: { adset_id/adgroup_id, budget }. For TikTok actions: { adgroup_id } or { campaign_id }. For CC actions: { purchase_id, cancel_reason? }.`,
        },
        cooldown_minutes: { type: 'number', description: 'Minimum minutes between rule firings. Defaults to 60.' },
      },
      required: ['name', 'trigger_config', 'action_type'],
    },
  },
  {
    name: 'update_rule',
    description: 'Update an existing automation rule. Any field not provided will remain unchanged.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'The rule ID to update' },
        name: { type: 'string', description: 'New name for the rule' },
        description: { type: 'string', description: 'New description' },
        trigger_type: { type: 'string', enum: ['metric_threshold', 'compound'], description: 'New trigger type' },
        trigger_config: { type: 'object', description: 'New trigger configuration' },
        action_type: { type: 'string', description: 'New action type' },
        action_config: { type: 'object', description: 'New action configuration' },
        action_meta: { type: 'object', description: 'New action target IDs/parameters' },
        cooldown_minutes: { type: 'number', description: 'New cooldown in minutes' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'delete_rule',
    description: 'Delete an automation rule and its execution history. Only use when the user explicitly asks to delete.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'The rule ID to delete' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'toggle_rule',
    description: 'Enable or disable an automation rule without deleting it.',
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
    name: 'get_rule_logs',
    description: 'Get the execution history/logs for a specific automation rule. Shows when it fired, whether it succeeded or failed, the trigger data, and action results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'The rule ID to get logs for' },
        limit: { type: 'number', description: 'Max number of logs to return. Defaults to 20.' },
      },
      required: ['rule_id'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // HISTORICAL DATA TOOLS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // NOTIFICATION TOOLS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // CREATIVE ANALYSIS TOOLS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // DATA VISUALIZATION
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'render_chart',
    description: `Render an inline chart or KPI card in the chat for the user. Use AFTER fetching data with analytics tools to visualize results.
- "kpi": summary stats (today's revenue, ROAS, conversions, CPA). Use kpis[] array.
- "line" or "area": timeseries trends (performance over days/weeks). Use data[] with xKey and yKeys[].
- "bar": comparing campaigns, adsets, offers, or creatives. Use data[] with xKey and yKeys[].
- "pie": share/breakdown of spend or revenue by category. Use data[] with xKey and one yKey.
Limit data to 50 points. Always also provide a brief text summary alongside the chart.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['line', 'bar', 'area', 'kpi', 'pie'],
          description: 'Chart type to render',
        },
        title: { type: 'string', description: 'Chart title displayed above the visualization' },
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of data points (max 50). Each object has keys matching xKey and yKeys.',
        },
        xKey: { type: 'string', description: 'Key in data objects for the X axis (e.g. "date", "campaign_name")' },
        yKeys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Data key for this series' },
              label: { type: 'string', description: 'Display label' },
              color: { type: 'string', description: 'Hex color (e.g. "#22c55e")' },
              format: { type: 'string', enum: ['currency', 'percent', 'number', 'ratio'], description: 'Value format' },
            },
            required: ['key'],
          },
          description: 'Y-axis series definitions',
        },
        kpis: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'KPI label (e.g. "Revenue")' },
              value: { type: ['number', 'string'], description: 'KPI value' },
              format: { type: 'string', enum: ['currency', 'percent', 'number', 'ratio'], description: 'Value format' },
              delta: { type: 'number', description: 'Percent change (positive = up, negative = down)' },
            },
            required: ['label', 'value'],
          },
          description: 'KPI cards array (for type "kpi" only)',
        },
      },
      required: ['type', 'title'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // ACTION CONFIRMATION (programmatic gate for write actions)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'confirm_action',
    description: 'Execute a pending write action AFTER the user explicitly confirms. Write actions (pause, enable, budget changes, subscription changes) always return a pending_id instead of executing immediately. Present the action description to the user, then call this tool ONLY when the user says "confirm", "yes", "do it", "go ahead", or similar explicit approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pending_id: { type: 'string', description: 'The pending_id returned by the write action that needs confirmation' },
      },
      required: ['pending_id'],
    },
  },
  {
    name: 'cancel_action',
    description: 'Cancel a pending write action when the user declines. Call this when the user says "no", "cancel", "nevermind", or similar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pending_id: { type: 'string', description: 'The pending_id of the action to cancel' },
      },
      required: ['pending_id'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════

// SQL validation (shared logic from sql-builder route)
const ALLOWED_PREFIXES = /^\s*(SELECT|WITH|EXPLAIN)\s/i;
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|DO)\b/i;
const SQL_COMMENT_PATTERN = /--[^\n]*|\/\*[\s\S]*?\*\//g;

function validateAndSanitizeSql(sql: string): { valid: boolean; error?: string; cleaned: string } {
  const cleaned = sql.replace(SQL_COMMENT_PATTERN, ' ').trim();
  if (!ALLOWED_PREFIXES.test(cleaned)) {
    return { valid: false, error: 'Only SELECT, WITH, and EXPLAIN queries are allowed', cleaned };
  }
  if (FORBIDDEN_KEYWORDS.test(cleaned)) {
    return { valid: false, error: 'Query contains forbidden keywords', cleaned };
  }
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

// Helper: build platform-specific ad table queries
function buildPlatformAdQuery(platform: string | undefined, userId: string, af: { clause: string; params: any[] }): { query: string; params: any[] } {
  const tables: { table: string; adsetName: string; adsetId: string }[] = [];

  if (!platform || platform === 'meta') {
    tables.push({ table: 'fb_ads_today', adsetName: 'ad_set_name', adsetId: 'ad_set_id' });
  }
  if (!platform || platform === 'tiktok') {
    tables.push({ table: 'tiktok_ads_today', adsetName: 'adgroup_name', adsetId: 'adgroup_id' });
  }
  if (!platform || platform === 'newsbreak') {
    tables.push({ table: 'newsbreak_ads_today', adsetName: 'adset_name', adsetId: 'adset_id' });
  }

  const unions = tables.map((t) =>
    `SELECT campaign_name, campaign_id, ${t.adsetName} AS adset_name, ${t.adsetId} AS adset_id, spend, clicks, impressions, '${t.table.replace('_ads_today', '').replace('fb', 'meta')}' AS platform FROM ${t.table} WHERE user_id = $1 ${af.clause}`
  );

  return {
    query: unions.join(' UNION ALL '),
    params: af.params,
  };
}

export async function executeTool(
  name: string,
  input: Record<string, any>,
  userId: number | null,
  _skipConfirmation?: boolean
): Promise<{ result: any; summary: string; chartSpec?: any }> {
  // ── Confirmation gate: validate ID + require explicit user confirmation ──
  if (WRITE_ACTIONS.has(name) && !_skipConfirmation) {
    // Step 1: Validate the target entity exists — fuzzy suggest if not
    const validation = await validateEntityId(name, input, userId);
    if (!validation.valid) {
      return {
        result: {
          status: 'not_found',
          error: validation.error,
          suggestions: validation.suggestions,
        },
        summary: `❌ Not found — ${validation.suggestions?.length || 0} suggestions`,
      };
    }

    // Step 1b: If name was resolved to an ID, inject it into the input
    if (validation.resolvedId) {
      const lookup = getEntityLookup(name);
      if (lookup) {
        input[lookup.inputKey] = validation.resolvedId;
      }
    }

    // Step 2: Create pending action with entity name for clear confirmation
    const description = buildActionDescription(name, input, validation.entityName);
    const id = randomUUID();
    pendingActions.set(id, { id, tool: name, input: { ...input }, userId, description, createdAt: Date.now() });
    return {
      result: {
        status: 'pending_confirmation',
        pending_id: id,
        action: name,
        description,
        details: input,
      },
      summary: `⏳ Pending confirmation: ${description}`,
    };
  }

  switch (name) {
    // ── Metrics & Analytics ────────────────────────────────────

    case 'get_campaign_metrics': {
      const af = buildAccountFilter(input, 2);
      const { query: adQuery, params: adParams } = buildPlatformAdQuery(input.platform, String(userId), af);
      const result = await pool.query(
        `WITH all_ads AS (${adQuery})
         SELECT campaign_name, campaign_id, platform,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::FLOAT / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM all_ads
         GROUP BY campaign_name, campaign_id, platform
         ORDER BY spend DESC`,
        [userId, ...adParams]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} campaigns found`,
      };
    }

    case 'get_adset_metrics': {
      const af = buildAccountFilter(input, 2);
      const { query: adQuery, params: adParams } = buildPlatformAdQuery(input.platform, String(userId), af);
      const result = await pool.query(
        `WITH all_ads AS (${adQuery})
         SELECT adset_name, adset_id, campaign_name, platform,
           SUM(spend) AS spend, SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc
         FROM all_ads
         GROUP BY adset_name, adset_id, campaign_name, platform
         ORDER BY spend DESC`,
        [userId, ...adParams]
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
           GREATEST(COALESCE(cc.revenue, 0), COALESCE(nb.platform_revenue, 0)) AS today_revenue,
           GREATEST(COALESCE(cc.conversions, 0), COALESCE(nb.platform_conversions, 0)) AS today_conversions
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
           SELECT SUM(spend) AS spend,
             COALESCE(SUM(conversion_value), 0) AS platform_revenue,
             COALESCE(SUM(conversions), 0) AS platform_conversions
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

    // ── Meta (Facebook) Ads Actions ────────────────────────────
    // Support both old names (pause_adset) and new names (pause_meta_adset)

    case 'pause_adset':
    case 'pause_meta_adset': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await pauseAdset(input.adset_id, accessToken);
      return { result: res, summary: `Meta adset ${input.adset_id} paused` };
    }

    case 'enable_adset':
    case 'enable_meta_adset': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await enableAdset(input.adset_id, accessToken);
      return { result: res, summary: `Meta adset ${input.adset_id} enabled` };
    }

    case 'adjust_budget':
    case 'adjust_meta_budget': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }

      if (input.increase_percent != null) {
        const res = await increaseBudget(input.adset_id, input.increase_percent, accessToken);
        return { result: res, summary: `Meta adset ${input.adset_id} budget increased by ${input.increase_percent}%` };
      }
      if (input.decrease_percent != null) {
        const res = await decreaseBudget(input.adset_id, input.decrease_percent, accessToken);
        return { result: res, summary: `Meta adset ${input.adset_id} budget decreased by ${input.decrease_percent}%` };
      }
      if (input.daily_budget == null) {
        return { result: { error: 'Provide daily_budget, increase_percent, or decrease_percent' }, summary: 'Failed: no budget value specified' };
      }
      const budgetCents = Math.round(input.daily_budget * 100);
      const res = await adjustBudget(input.adset_id, budgetCents, accessToken);
      return { result: res, summary: `Meta adset ${input.adset_id} budget set to $${input.daily_budget}/day` };
    }

    case 'pause_meta_campaign': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await updateCampaignStatus(input.campaign_id, 'PAUSED', accessToken);
      return { result: res, summary: `Meta campaign ${input.campaign_id} paused` };
    }

    case 'enable_meta_campaign': {
      const accessToken = await getSetting('fb_access_token', userId);
      if (!accessToken) {
        return { result: { error: 'No Meta access token configured' }, summary: 'Failed: no access token' };
      }
      const res = await updateCampaignStatus(input.campaign_id, 'ACTIVE', accessToken);
      return { result: res, summary: `Meta campaign ${input.campaign_id} enabled` };
    }

    // ── TikTok Ads Actions ─────────────────────────────────────

    case 'pause_tiktok_adgroup': {
      if (!userId) return { result: { error: 'No user context' }, summary: 'Failed: no user' };
      const res = await pauseTikTokAdGroup(input.adgroup_id, userId);
      return { result: res, summary: `TikTok ad group ${input.adgroup_id} paused` };
    }

    case 'enable_tiktok_adgroup': {
      if (!userId) return { result: { error: 'No user context' }, summary: 'Failed: no user' };
      const res = await enableTikTokAdGroup(input.adgroup_id, userId);
      return { result: res, summary: `TikTok ad group ${input.adgroup_id} enabled` };
    }

    case 'adjust_tiktok_budget': {
      if (!userId) return { result: { error: 'No user context' }, summary: 'Failed: no user' };
      if (input.increase_percent != null) {
        const res = await increaseTikTokBudget(input.adgroup_id, input.increase_percent, userId);
        return { result: res, summary: `TikTok ad group ${input.adgroup_id} budget increased by ${input.increase_percent}%` };
      }
      if (input.decrease_percent != null) {
        const res = await decreaseTikTokBudget(input.adgroup_id, input.decrease_percent, userId);
        return { result: res, summary: `TikTok ad group ${input.adgroup_id} budget decreased by ${input.decrease_percent}%` };
      }
      if (input.daily_budget == null) {
        return { result: { error: 'Provide daily_budget, increase_percent, or decrease_percent' }, summary: 'Failed: no budget value' };
      }
      const res = await adjustTikTokBudget(input.adgroup_id, input.daily_budget, userId);
      return { result: res, summary: `TikTok ad group ${input.adgroup_id} budget set to $${input.daily_budget}/day` };
    }

    case 'pause_tiktok_campaign': {
      if (!userId) return { result: { error: 'No user context' }, summary: 'Failed: no user' };
      const res = await updateTikTokCampaignStatus(input.campaign_id, 'DISABLE', userId);
      return { result: res, summary: `TikTok campaign ${input.campaign_id} paused` };
    }

    case 'enable_tiktok_campaign': {
      if (!userId) return { result: { error: 'No user context' }, summary: 'Failed: no user' };
      const res = await updateTikTokCampaignStatus(input.campaign_id, 'ENABLE', userId);
      return { result: res, summary: `TikTok campaign ${input.campaign_id} enabled` };
    }

    // ── Checkout Champ Actions ─────────────────────────────────

    case 'pause_cc_subscription': {
      const client = await CheckoutChampClient.fromSettings(userId ?? undefined);
      if (!client) {
        return { result: { error: 'No Checkout Champ credentials configured' }, summary: 'Failed: no CC credentials' };
      }
      const res = await client.pausePurchase(input.purchase_id);
      return { result: { status: res.result }, summary: `CC subscription ${input.purchase_id} paused` };
    }

    case 'cancel_cc_subscription': {
      const client = await CheckoutChampClient.fromSettings(userId ?? undefined);
      if (!client) {
        return { result: { error: 'No Checkout Champ credentials configured' }, summary: 'Failed: no CC credentials' };
      }
      const reason = input.reason || 'Cancelled via operator';
      const res = await client.cancelPurchase(input.purchase_id, reason);
      return { result: { status: res.result }, summary: `CC subscription ${input.purchase_id} cancelled` };
    }

    // ── SQL ────────────────────────────────────────────────────

    case 'run_sql': {
      const { valid, error, cleaned } = validateAndSanitizeSql(input.sql);
      if (!valid) {
        return { result: { error }, summary: `SQL rejected: ${error}` };
      }

      const hasUserFilter = /user_id/i.test(cleaned);
      const client = await pool.connect();
      try {
        await client.query('SET statement_timeout = 15000');
        await client.query('SET app.current_user_id = $1', [String(Number(userId))]);
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

    // ── Automation Rules ───────────────────────────────────────

    case 'list_rules': {
      const result = await pool.query(
        `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config, action_meta,
                enabled, cooldown_minutes, last_fired_at, created_at,
                (SELECT COUNT(*) FROM rule_execution_log WHERE rule_id = automation_rules.id AND status = 'success' AND triggered_at > NOW() - INTERVAL '24 hours') AS fires_24h,
                (SELECT COUNT(*) FROM rule_execution_log WHERE rule_id = automation_rules.id AND status = 'failure' AND triggered_at > NOW() - INTERVAL '24 hours') AS errors_24h
         FROM automation_rules WHERE user_id = $1 ORDER BY id`,
        [userId]
      );
      return {
        result: result.rows,
        summary: `${result.rows.length} automation rules found (${result.rows.filter((r: any) => r.enabled).length} enabled)`,
      };
    }

    case 'create_rule': {
      const VALID_ACTION_TYPES = [
        'notification', 'email_notify', 'slack_notify', 'webhook', 'flag_review',
        'pause_adset', 'enable_adset', 'adjust_budget', 'increase_budget_pct', 'decrease_budget_pct',
        'pause_campaign', 'enable_campaign',
        'pause_tiktok_adgroup', 'enable_tiktok_adgroup', 'adjust_tiktok_budget',
        'increase_tiktok_budget_pct', 'decrease_tiktok_budget_pct',
        'pause_tiktok_campaign', 'enable_tiktok_campaign',
        'pause_cc_subscription', 'cancel_cc_subscription',
      ];

      if (!VALID_ACTION_TYPES.includes(input.action_type)) {
        return {
          result: { error: `Invalid action_type "${input.action_type}". Valid types: ${VALID_ACTION_TYPES.join(', ')}` },
          summary: `Failed: invalid action_type "${input.action_type}"`,
        };
      }

      const triggerType = input.trigger_type || 'metric_threshold';
      const cooldownMinutes = input.cooldown_minutes ?? 60;
      const result = await pool.query(
        `INSERT INTO automation_rules (user_id, name, description, trigger_type, trigger_config, action_type, action_config, action_meta, cooldown_minutes, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         RETURNING *`,
        [
          userId,
          input.name,
          input.description || null,
          triggerType,
          JSON.stringify(input.trigger_config),
          input.action_type,
          JSON.stringify(input.action_config || {}),
          JSON.stringify(input.action_meta || {}),
          cooldownMinutes,
        ]
      );
      return {
        result: result.rows[0],
        summary: `Rule "${input.name}" created (id: ${result.rows[0].id})`,
      };
    }

    case 'update_rule': {
      // Build dynamic SET clause for only provided fields
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        name: 'name',
        description: 'description',
        trigger_type: 'trigger_type',
        action_type: 'action_type',
        cooldown_minutes: 'cooldown_minutes',
      };
      const jsonFields = ['trigger_config', 'action_config', 'action_meta'];

      for (const [key, col] of Object.entries(fieldMap)) {
        if (input[key] !== undefined) {
          fields.push(`${col} = $${idx++}`);
          values.push(input[key]);
        }
      }
      for (const key of jsonFields) {
        if (input[key] !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(JSON.stringify(input[key]));
        }
      }

      if (fields.length === 0) {
        return { result: { error: 'No fields to update' }, summary: 'No fields provided' };
      }

      fields.push('updated_at = NOW()');
      values.push(input.rule_id, userId);

      const result = await pool.query(
        `UPDATE automation_rules SET ${fields.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return { result: { error: 'Rule not found or not owned by user' }, summary: `Failed to update rule ${input.rule_id}` };
      }

      return {
        result: result.rows[0],
        summary: `Rule "${result.rows[0].name}" updated`,
      };
    }

    case 'delete_rule': {
      // Delete logs first
      await pool.query('DELETE FROM rule_execution_log WHERE rule_id = $1', [input.rule_id]);
      const result = await pool.query(
        'DELETE FROM automation_rules WHERE id = $1 AND user_id = $2 RETURNING id, name',
        [input.rule_id, userId]
      );
      if (result.rows.length === 0) {
        return { result: { error: 'Rule not found or not owned by user' }, summary: `Failed to delete rule ${input.rule_id}` };
      }
      return {
        result: { deleted: true, id: result.rows[0].id },
        summary: `Rule "${result.rows[0].name}" deleted`,
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
        return { result: { error: 'Rule not found or not owned by user' }, summary: `Failed to toggle rule ${input.rule_id}` };
      }
      const row = result.rows[0];
      return { result: row, summary: `Rule "${row.name}" ${row.enabled ? 'enabled' : 'disabled'}` };
    }

    case 'get_rule_logs': {
      const lim = Math.min(input.limit || 20, 100);
      // Verify ownership
      const ruleCheck = await pool.query(
        'SELECT id, name FROM automation_rules WHERE id = $1 AND user_id = $2',
        [input.rule_id, userId]
      );
      if (ruleCheck.rows.length === 0) {
        return { result: { error: 'Rule not found or not owned by user' }, summary: 'Rule not found' };
      }

      const result = await pool.query(
        `SELECT id, status, trigger_data, action_result, action_detail, error_message, triggered_at
         FROM rule_execution_log
         WHERE rule_id = $1
         ORDER BY triggered_at DESC
         LIMIT $2`,
        [input.rule_id, lim]
      );

      return {
        result: { rule_name: ruleCheck.rows[0].name, logs: result.rows },
        summary: `${result.rows.length} execution logs for rule "${ruleCheck.rows[0].name}"`,
      };
    }

    // ── Historical Data ────────────────────────────────────────

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

    // ── Notifications ──────────────────────────────────────────

    case 'send_notification': {
      const notifType = input.type || 'operator_alert';
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, type, title, message, created_at`,
        [userId, notifType, input.title, input.message, JSON.stringify({})]
      );
      getRealtime()?.emitNotification(userId!, { title: input.title, message: input.message });
      return { result: result.rows[0], summary: `Notification sent: "${input.title}"` };
    }

    // ── Creative Analysis Tools ────────────────────────────────

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

    // ── Data Visualization ──────────────────────────────────────
    case 'render_chart': {
      const chartId = randomUUID();
      // Cap data to 50 points
      const data = Array.isArray(input.data) ? input.data.slice(0, 50) : [];
      const chartSpec = {
        id: chartId,
        type: input.type,
        title: input.title,
        data,
        xKey: input.xKey,
        yKeys: input.yKeys,
        kpis: input.kpis,
      };
      return {
        result: { rendered: true, chart_id: chartId },
        summary: `📊 Chart rendered: ${input.title}`,
        chartSpec,
      };
    }

    // ── Action Confirmation ───────────────────────────────────
    case 'confirm_action': {
      const pending = pendingActions.get(input.pending_id);
      if (!pending) {
        return {
          result: { error: 'No pending action found. It may have expired (5 min TTL) or already been executed.' },
          summary: 'No pending action found',
        };
      }
      if (pending.userId !== userId) {
        return { result: { error: 'This action belongs to a different user' }, summary: 'Permission denied' };
      }
      pendingActions.delete(input.pending_id);
      // Execute the actual write action with confirmation bypass
      return executeTool(pending.tool, pending.input, pending.userId, true);
    }

    case 'cancel_action': {
      const pending = pendingActions.get(input.pending_id);
      if (!pending) {
        return { result: { error: 'No pending action found' }, summary: 'No pending action found' };
      }
      if (pending.userId !== userId) {
        return { result: { error: 'This action belongs to a different user' }, summary: 'Permission denied' };
      }
      pendingActions.delete(input.pending_id);
      return {
        result: { cancelled: true, action: pending.description },
        summary: `Cancelled: ${pending.description}`,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
  }
}
