import { App, LogLevel } from '@slack/bolt';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';

let slackApp: App | null = null;

// Pinned dashboard tracking: channelId -> { ts, userId }
const pinnedDashboards: Map<string, { ts: string; userId: number | null }> = new Map();

// Debounce: per-channel last update timestamp + pending timeout
const updateDebounce: Map<string, NodeJS.Timeout> = new Map();
const DEBOUNCE_MS = 3000; // 3s debounce so rapid webhooks don't spam Slack API

// ----- Data Fetchers -----

interface FullMetrics {
  // Totals
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
  clicks: number;
  impressions: number;
  lpViews: number;
  newCustomers: number;
  // Derived
  cpc: number;
  cpm: number;
  cvr: number;
  hookRate: number;
  holdRate: number;
  cac: number;
}

interface BreakdownRow {
  label: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpc: number;
  cpm: number;
  cvr: number;
}

function computeDerived(spend: number, revenue: number, conversions: number, clicks: number, impressions: number, lpViews: number, newCustomers: number): FullMetrics {
  return {
    spend, revenue, conversions, clicks, impressions, lpViews, newCustomers,
    roas: spend > 0 ? revenue / spend : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
    hookRate: impressions > 0 ? (lpViews / impressions) * 100 : 0,
    holdRate: 0, // Requires ThruPlay data not currently synced
    cac: newCustomers > 0 ? spend / newCustomers : 0,
  };
}

async function fetchFullMetrics(userId: number | null): Promise<FullMetrics> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const [adsResult, ordersResult] = await Promise.all([
    pool.query(`
      SELECT COALESCE(SUM(spend), 0) AS spend,
             COALESCE(SUM(clicks), 0) AS clicks,
             COALESCE(SUM(impressions), 0) AS impressions,
             COALESCE(SUM(landing_page_views), 0) AS lp_views
      FROM fb_ads_today ${uf}
    `, params),
    pool.query(`
      SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions,
             COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
    `, params),
  ]);

  const a = adsResult.rows[0];
  const o = ordersResult.rows[0];
  return computeDerived(
    parseFloat(a.spend) || 0,
    parseFloat(o.revenue) || 0,
    parseInt(o.conversions) || 0,
    parseInt(a.clicks) || 0,
    parseInt(a.impressions) || 0,
    parseInt(a.lp_views) || 0,
    parseInt(o.new_customers) || 0,
  );
}

async function fetchAccountBreakdown(userId: number | null): Promise<BreakdownRow[]> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH fb AS (
      SELECT account_name,
             SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM fb_ads_today ${uf}
      GROUP BY account_name
    ),
    cc AS (
      SELECT utm_source AS label,
             COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
      GROUP BY utm_source
    )
    SELECT fb.account_name AS label,
           COALESCE(fb.spend, 0) AS spend,
           COALESCE(cc.revenue, 0) AS revenue,
           COALESCE(fb.clicks, 0) AS clicks,
           COALESCE(fb.impressions, 0) AS impressions,
           COALESCE(cc.conversions, 0) AS conversions
    FROM fb
    LEFT JOIN cc ON true
    ORDER BY fb.spend DESC
    LIMIT 8
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    return {
      label: r.label || 'Unknown',
      spend, revenue, clicks, impressions, conversions,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
    };
  });
}

async function fetchOfferBreakdown(userId: number | null): Promise<BreakdownRow[]> {
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const uf = userId ? 'WHERE user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH cc AS (
      SELECT offer_name,
             COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
      GROUP BY offer_name
    ),
    fb AS (
      SELECT ad_set_name AS campaign,
             SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM fb_ads_today ${uf}
      GROUP BY ad_set_name
    )
    SELECT cc.offer_name AS label,
           COALESCE(fb.spend, 0) AS spend,
           cc.revenue,
           COALESCE(fb.clicks, 0) AS clicks,
           COALESCE(fb.impressions, 0) AS impressions,
           cc.conversions
    FROM cc
    LEFT JOIN fb ON fb.campaign = cc.offer_name
    ORDER BY cc.revenue DESC
    LIMIT 8
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    return {
      label: r.label || 'Unknown',
      spend, revenue, clicks, impressions, conversions,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
    };
  });
}

async function fetchCampaignBreakdown(userId: number | null): Promise<BreakdownRow[]> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH fb AS (
      SELECT campaign_name,
             SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM fb_ads_today ${uf}
      GROUP BY campaign_name
    ),
    cc AS (
      SELECT utm_campaign,
             COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
      GROUP BY utm_campaign
    )
    SELECT fb.campaign_name AS label,
           COALESCE(fb.spend, 0) AS spend,
           COALESCE(cc.revenue, 0) AS revenue,
           COALESCE(fb.clicks, 0) AS clicks,
           COALESCE(fb.impressions, 0) AS impressions,
           COALESCE(cc.conversions, 0) AS conversions
    FROM fb
    LEFT JOIN cc ON fb.campaign_name = cc.utm_campaign
    ORDER BY fb.spend DESC
    LIMIT 10
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    return {
      label: r.label || 'Unknown',
      spend, revenue, clicks, impressions, conversions,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
    };
  });
}

// ----- Formatters -----

function $(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function roasEmoji(roas: number): string {
  if (roas >= 3) return ':rocket:';
  if (roas >= 2) return ':large_green_circle:';
  if (roas >= 1) return ':large_yellow_circle:';
  return ':red_circle:';
}

// Resolve Slack user to OpticData userId
async function resolveSlackUser(_slackUserId: string): Promise<number | null> {
  try {
    const result = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
    return result.rows[0]?.id || null;
  } catch {
    return null;
  }
}

// ----- Block Kit Builders -----

function buildBreakdownTable(title: string, rows: BreakdownRow[]): any[] {
  if (rows.length === 0) return [];

  const header = `*${title}*`;
  let table = '```\n';
  table += 'Name             Spend     Rev       ROAS   CPA     CPC    CPM     CVR\n';
  table += '───────────────  ────────  ────────  ─────  ──────  ─────  ──────  ────\n';

  for (const r of rows) {
    const name = (r.label || '').substring(0, 15).padEnd(15);
    const spend = $(r.spend).padStart(8);
    const rev = $(r.revenue).padStart(8);
    const roas = `${r.roas.toFixed(2)}x`.padStart(5);
    const cpa = $(r.cpa).padStart(6);
    const cpc = $(r.cpc).padStart(5);
    const cpm = $(r.cpm).padStart(6);
    const cvr = pct(r.cvr).padStart(4);
    table += `${name}  ${spend}  ${rev}  ${roas}  ${cpa}  ${cpc}  ${cpm}  ${cvr}\n`;
  }
  table += '```';

  return [
    { type: 'section', text: { type: 'mrkdwn', text: header } },
    { type: 'section', text: { type: 'mrkdwn', text: table } },
  ];
}

async function buildDashboardBlocks(userId: number | null): Promise<any[]> {
  const [m, campaigns, offers] = await Promise.all([
    fetchFullMetrics(userId),
    fetchCampaignBreakdown(userId),
    fetchOfferBreakdown(userId),
  ]);

  const profitLoss = m.revenue - m.spend;
  const plSign = profitLoss >= 0 ? '+' : '';
  const plEmoji = profitLoss >= 0 ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:';
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `OpticData Live Dashboard` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `:clock1: Updated ${now} ET  |  ${roasEmoji(m.roas)} ROAS ${m.roas.toFixed(2)}x  |  ${plEmoji} P/L ${plSign}${$(profitLoss)}` },
      ],
    },
    { type: 'divider' },
    // Row 1: Core financials
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `:moneybag: *Spend*\n${$(m.spend)}` },
        { type: 'mrkdwn', text: `:money_with_wings: *Revenue*\n${$(m.revenue)}` },
        { type: 'mrkdwn', text: `:chart_with_upwards_trend: *ROAS*\n${m.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `:package: *Orders*\n${m.conversions}` },
      ],
    },
    // Row 2: Efficiency metrics
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CPA*\n${$(m.cpa)}` },
        { type: 'mrkdwn', text: `*CAC*\n${$(m.cac)}` },
        { type: 'mrkdwn', text: `*CPC*\n${$(m.cpc)}` },
        { type: 'mrkdwn', text: `*CPM*\n${$(m.cpm)}` },
      ],
    },
    // Row 3: Engagement metrics
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CVR*\n${pct(m.cvr)}` },
        { type: 'mrkdwn', text: `*Hook Rate*\n${pct(m.hookRate)}` },
        { type: 'mrkdwn', text: `*Clicks*\n${m.clicks.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Impressions*\n${m.impressions.toLocaleString()}` },
      ],
    },
    { type: 'divider' },
  ];

  // Campaign breakdown
  blocks.push(...buildBreakdownTable(':bar_chart: Campaigns', campaigns));

  // Offer breakdown
  if (offers.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push(...buildBreakdownTable(':shopping_bags: Offers', offers));
  }

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `_Auto-refreshes on new data  |  /optic pin to create  |  /optic unpin to stop_` },
    ],
  });

  return blocks;
}

// ----- Real-time dashboard refresh (called from realtime.ts on data events) -----

export function refreshPinnedDashboards(userId: number | null): void {
  if (!slackApp || pinnedDashboards.size === 0) return;

  for (const [channelId, pinned] of pinnedDashboards.entries()) {
    // Only refresh dashboards that match the userId (or null = refresh all)
    if (userId !== null && pinned.userId !== null && pinned.userId !== userId) continue;

    // Debounce: clear any pending update for this channel, schedule new one
    const pending = updateDebounce.get(channelId);
    if (pending) clearTimeout(pending);

    updateDebounce.set(channelId, setTimeout(async () => {
      updateDebounce.delete(channelId);
      try {
        const updatedBlocks = await buildDashboardBlocks(pinned.userId);
        await slackApp!.client.chat.update({
          channel: channelId,
          ts: pinned.ts,
          blocks: updatedBlocks,
          text: 'OpticData Live Dashboard',
        });
      } catch (err) {
        console.error('[Slack Bot] Failed to update pinned dashboard:', err);
        // If message was deleted or channel gone, remove tracking
        pinnedDashboards.delete(channelId);
      }
    }, DEBOUNCE_MS));
  }
}

// ----- Slack Bot Init -----

export function initSlackBot(): void {
  const token = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!token || !signingSecret) {
    console.log('[Slack Bot] SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set, skipping init');
    return;
  }

  slackApp = new App({
    token,
    signingSecret,
    ...(appToken ? { socketMode: true, appToken } : {}),
    logLevel: LogLevel.WARN,
  });

  // /optic slash command
  slackApp.command('/optic', async ({ command, ack, respond, client }: { command: any; ack: any; respond: any; client: any }) => {
    await ack();
    const args = command.text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase() || 'help';
    const userId = await resolveSlackUser(command.user_id);

    try {
      if (subCommand === 'status' || subCommand === 'dashboard') {
        const blocks = await buildDashboardBlocks(userId);
        await respond({ blocks, response_type: 'ephemeral' });

      } else if (subCommand === 'pin') {
        // Post a public dashboard message and pin it, auto-updates on new data
        const channelId = command.channel_id;

        // Remove existing pinned dashboard in this channel
        pinnedDashboards.delete(channelId);

        const blocks = await buildDashboardBlocks(userId);
        let postResult;
        try {
          // Try joining the channel first (works for public channels)
          try {
            const joinResult = await client.conversations.join({ channel: channelId });
            console.log('[Slack Bot] Joined channel:', channelId, joinResult.ok);
          } catch (joinErr: any) {
            console.log('[Slack Bot] Join attempt:', channelId, joinErr?.data?.error || joinErr?.message);
          }
          postResult = await client.chat.postMessage({
            channel: channelId,
            blocks,
            text: 'OpticData Live Dashboard',
          });
        } catch (postErr: any) {
          const slackError = postErr?.data?.error || postErr?.message || 'unknown';
          console.error('[Slack Bot] postMessage failed:', channelId, slackError, JSON.stringify(postErr?.data));
          if (slackError === 'channel_not_found' || slackError === 'not_in_channel') {
            await respond({ text: ':warning: Bot cannot post in this channel. Go to channel settings > Integrations > Add Apps and add OpticData. Then retry `/optic pin`.', response_type: 'ephemeral' });
          } else {
            await respond({ text: `:warning: Failed to post dashboard: \`${slackError}\`. Check bot scopes and channel permissions.`, response_type: 'ephemeral' });
          }
          return;
        }

        if (postResult.ok && postResult.ts) {
          // Pin it
          try {
            await client.pins.add({ channel: channelId, timestamp: postResult.ts });
          } catch {
            // May fail if already pinned or no permission — dashboard still works without pin
          }

          pinnedDashboards.set(channelId, { ts: postResult.ts, userId });
          await respond({ text: ':white_check_mark: Live dashboard posted! It will auto-update when new data arrives. Use `/optic unpin` to stop.', response_type: 'ephemeral' });
        }

      } else if (subCommand === 'unpin') {
        const channelId = command.channel_id;
        const pinned = pinnedDashboards.get(channelId);
        if (pinned) {
          // Clear any pending debounce
          const pending = updateDebounce.get(channelId);
          if (pending) { clearTimeout(pending); updateDebounce.delete(channelId); }
          try {
            await client.pins.remove({ channel: channelId, timestamp: pinned.ts });
          } catch { /* ignore */ }
          pinnedDashboards.delete(channelId);
          await respond({ text: ':x: Live dashboard unpinned and auto-updates stopped.', response_type: 'ephemeral' });
        } else {
          await respond({ text: 'No pinned dashboard found in this channel.', response_type: 'ephemeral' });
        }

      } else if (subCommand === 'roas') {
        const m = await fetchFullMetrics(userId);
        await respond(`ROAS today: *${m.roas.toFixed(2)}x* (${$(m.revenue)} rev / ${$(m.spend)} spend)`);
      } else if (subCommand === 'spend') {
        const m = await fetchFullMetrics(userId);
        await respond(`Ad spend today: *${$(m.spend)}* | CPC ${$(m.cpc)} | CPM ${$(m.cpm)}`);
      } else if (subCommand === 'cpa') {
        const m = await fetchFullMetrics(userId);
        await respond(`CPA today: *${$(m.cpa)}* | CAC ${$(m.cac)} | ${m.conversions} conversions (${m.newCustomers} new)`);
      } else if (subCommand === 'revenue') {
        const m = await fetchFullMetrics(userId);
        const profit = m.revenue - m.spend;
        await respond(`Revenue today: *${$(m.revenue)}* from ${m.conversions} orders | P/L: ${profit >= 0 ? '+' : ''}${$(profit)}`);
      } else if (subCommand === 'ask') {
        const question = args.slice(1).join(' ');
        if (!question) {
          await respond('Usage: `/optic ask <your question>`');
          return;
        }
        const answer = await askOperatorAI(question, userId);
        await respond(answer);
      } else {
        await respond({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'OpticData Commands' } },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  '`/optic status` — Full dashboard (private)',
                  '`/optic pin` — Post & pin live dashboard to channel (auto-updates on new data)',
                  '`/optic unpin` — Stop auto-updating pinned dashboard',
                  '`/optic roas` — Today\'s ROAS',
                  '`/optic spend` — Spend + CPC/CPM',
                  '`/optic cpa` — CPA + CAC + conversions',
                  '`/optic revenue` — Revenue + P/L',
                  '`/optic ask <question>` — Ask AI about your data',
                ].join('\n'),
              },
            },
          ],
        });
      }
    } catch (err) {
      console.error('[Slack Bot] Command error:', err);
      await respond('Something went wrong. Please try again.');
    }
  });

  // @mention handler for AI questions
  slackApp.event('app_mention', async ({ event, say }: { event: any; say: any }) => {
    const text = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    if (!text) {
      await say('Hi! Ask me anything about your ad performance. Try: "What\'s my ROAS today?"');
      return;
    }

    const userId = await resolveSlackUser(event.user);

    try {
      const answer = await askOperatorAI(text, userId);
      await say({ text: answer, thread_ts: event.ts });
    } catch (err) {
      console.error('[Slack Bot] Mention error:', err);
      await say({ text: 'Sorry, I had trouble processing that. Please try again.', thread_ts: event.ts });
    }
  });

  // Start the app
  (async () => {
    if (appToken) {
      await slackApp!.start();
      console.log('[Slack Bot] Started in socket mode');
    } else {
      console.log('[Slack Bot] Initialized (events via HTTP)');
    }
  })();
}

async function askOperatorAI(question: string, userId: number | null): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'Anthropic API key not configured.';

  const m = await fetchFullMetrics(userId);
  const context = `Current metrics today: Spend=${$(m.spend)}, Revenue=${$(m.revenue)}, ROAS=${m.roas.toFixed(2)}x, CPA=${$(m.cpa)}, CAC=${$(m.cac)}, CPC=${$(m.cpc)}, CPM=${$(m.cpm)}, CVR=${pct(m.cvr)}, Hook Rate=${pct(m.hookRate)}, Orders=${m.conversions}, New Customers=${m.newCustomers}, Clicks=${m.clicks}, Impressions=${m.impressions}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `You are OpticData Operator, a concise media buying assistant answering via Slack. Keep responses short (2-4 sentences). Use Slack markdown formatting (*bold*, _italic_). Here is the user's data:\n${context}`,
    messages: [{ role: 'user', content: question }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  return text || 'No response generated.';
}

export function getSlackApp(): App | null {
  return slackApp;
}
