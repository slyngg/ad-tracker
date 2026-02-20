import { App, LogLevel } from '@slack/bolt';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { operatorTools, executeTool } from './operator-tools';

let slackApp: App | null = null;

// Pinned dashboard tracking: channelId -> { ts, userId, page }
const pinnedDashboards: Map<string, { ts: string; userId: number | null; page: number }> = new Map();
const PAGE_NAMES = ['Overview', 'Campaigns', 'Offers', 'Accounts'];
const TOTAL_PAGES = PAGE_NAMES.length;

// Debounce: per-channel last update timestamp + pending timeout
const updateDebounce: Map<string, NodeJS.Timeout> = new Map();
const DEBOUNCE_MS = 3000; // 3s debounce so rapid webhooks don't spam Slack API

// ----- Data Fetchers -----

interface FullMetrics {
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
  clicks: number;
  impressions: number;
  lpViews: number;
  newCustomers: number;
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
    holdRate: 0,
    cac: newCustomers > 0 ? spend / newCustomers : 0,
  };
}

function rowFromQuery(r: any): BreakdownRow {
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

  // Ad metrics per account; revenue attributed proportionally by spend share
  const result = await pool.query(`
    WITH fb AS (
      SELECT account_name,
             SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM fb_ads_today ${uf}
      GROUP BY account_name
    ),
    totals AS (
      SELECT COALESCE(SUM(spend), 0) AS total_spend FROM fb_ads_today ${uf}
    ),
    rev AS (
      SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue,
             COUNT(DISTINCT order_id) AS total_conversions
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
    )
    SELECT fb.account_name AS label,
           fb.spend,
           fb.clicks,
           fb.impressions,
           CASE WHEN totals.total_spend > 0
             THEN fb.spend / totals.total_spend * rev.total_revenue
             ELSE 0 END AS revenue,
           CASE WHEN totals.total_spend > 0
             THEN ROUND(fb.spend / totals.total_spend * rev.total_conversions)
             ELSE 0 END AS conversions
    FROM fb, totals, rev
    ORDER BY fb.spend DESC
    LIMIT 10
  `, params);

  return result.rows.map(rowFromQuery);
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
    LIMIT 10
  `, params);

  return result.rows.map(rowFromQuery);
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

  return result.rows.map(rowFromQuery);
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

// ----- Dashboard Link -----

const dashboardUrl = process.env.DASHBOARD_URL || 'https://optic-data.com';

function dashboardLinkBlock(): any {
  return {
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `<${dashboardUrl}|View full dashboard>` },
    ],
  };
}

// ----- Block Kit Builders -----

function buildBreakdownTable(title: string, rows: BreakdownRow[]): any[] {
  if (rows.length === 0) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: '_No data yet today._' } },
    ];
  }

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

function buildNavButtons(currentPage: number): any {
  const dots = PAGE_NAMES.map((name, i) =>
    i === currentPage ? `*${name}*` : name
  ).join('  ');

  const elements: any[] = [];

  if (currentPage > 0) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: ':arrow_left: Prev', emoji: true },
      action_id: 'dash_prev',
      value: String(currentPage - 1),
    });
  }

  elements.push({
    type: 'button',
    text: { type: 'plain_text', text: `${currentPage + 1}/${TOTAL_PAGES}`, emoji: true },
    action_id: 'dash_page_info',
    value: String(currentPage),
  });

  if (currentPage < TOTAL_PAGES - 1) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Next :arrow_right:', emoji: true },
      action_id: 'dash_next',
      value: String(currentPage + 1),
    });
  }

  return [
    { type: 'context', elements: [{ type: 'mrkdwn', text: dots }] },
    { type: 'actions', elements },
  ];
}

// Build header that appears on every page
function buildHeaderBlocks(m: FullMetrics): any[] {
  const profitLoss = m.revenue - m.spend;
  const plSign = profitLoss >= 0 ? '+' : '';
  const plEmoji = profitLoss >= 0 ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:';
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'OpticData Live Dashboard' },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `:clock1: Updated ${now} ET  |  ${roasEmoji(m.roas)} ROAS ${m.roas.toFixed(2)}x  |  ${plEmoji} P/L ${plSign}${$(profitLoss)}` },
      ],
    },
    { type: 'divider' },
  ];
}

// Page 0: Overview
function buildOverviewPage(m: FullMetrics): any[] {
  return [
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `:moneybag: *Spend*\n${$(m.spend)}` },
        { type: 'mrkdwn', text: `:money_with_wings: *Revenue*\n${$(m.revenue)}` },
        { type: 'mrkdwn', text: `:chart_with_upwards_trend: *ROAS*\n${m.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `:package: *Orders*\n${m.conversions}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CPA*\n${$(m.cpa)}` },
        { type: 'mrkdwn', text: `*CAC*\n${$(m.cac)}` },
        { type: 'mrkdwn', text: `*CPC*\n${$(m.cpc)}` },
        { type: 'mrkdwn', text: `*CPM*\n${$(m.cpm)}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CVR*\n${pct(m.cvr)}` },
        { type: 'mrkdwn', text: `*Hook Rate*\n${pct(m.hookRate)}` },
        { type: 'mrkdwn', text: `*Clicks*\n${m.clicks.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Impressions*\n${m.impressions.toLocaleString()}` },
      ],
    },
  ];
}

async function buildPageBlocks(userId: number | null, page: number): Promise<any[]> {
  const m = await fetchFullMetrics(userId);
  const blocks: any[] = [...buildHeaderBlocks(m)];

  if (page === 0) {
    // Overview
    blocks.push(...buildOverviewPage(m));
  } else if (page === 1) {
    // Campaigns
    const campaigns = await fetchCampaignBreakdown(userId);
    blocks.push(...buildBreakdownTable(':bar_chart: Campaigns', campaigns));
  } else if (page === 2) {
    // Offers
    const offers = await fetchOfferBreakdown(userId);
    blocks.push(...buildBreakdownTable(':shopping_bags: Offers', offers));
  } else if (page === 3) {
    // Accounts
    const accounts = await fetchAccountBreakdown(userId);
    blocks.push(...buildBreakdownTable(':office: Ad Accounts', accounts));
  }

  blocks.push({ type: 'divider' });
  blocks.push(...buildNavButtons(page));

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: '_Auto-refreshes on new data  |  /optic unpin to stop_' },
    ],
  });
  blocks.push(dashboardLinkBlock());

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
        const updatedBlocks = await buildPageBlocks(pinned.userId, pinned.page);
        await slackApp!.client.chat.update({
          channel: channelId,
          ts: pinned.ts,
          blocks: updatedBlocks,
          text: 'OpticData Live Dashboard',
        });
      } catch (err) {
        console.error('[Slack Bot] Failed to update pinned dashboard:', err);
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

  // ----- Button action handlers for dashboard pagination -----

  slackApp.action('dash_prev', async ({ ack, body, client }: { ack: any; body: any; client: any }) => {
    await ack();
    const channelId = body.channel?.id || body.container?.channel_id;
    const messageTs = body.message?.ts || body.container?.message_ts;
    if (!channelId || !messageTs) return;

    const targetPage = parseInt(body.actions?.[0]?.value) || 0;
    const pinned = pinnedDashboards.get(channelId);
    const userId = pinned?.userId ?? await resolveSlackUser(body.user?.id || '');

    // Update stored page
    if (pinned) {
      pinned.page = targetPage;
    }

    try {
      const blocks = await buildPageBlocks(userId, targetPage);
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: 'OpticData Live Dashboard',
      });
    } catch (err) {
      console.error('[Slack Bot] Page nav error:', err);
    }
  });

  slackApp.action('dash_next', async ({ ack, body, client }: { ack: any; body: any; client: any }) => {
    await ack();
    const channelId = body.channel?.id || body.container?.channel_id;
    const messageTs = body.message?.ts || body.container?.message_ts;
    if (!channelId || !messageTs) return;

    const targetPage = parseInt(body.actions?.[0]?.value) || 0;
    const pinned = pinnedDashboards.get(channelId);
    const userId = pinned?.userId ?? await resolveSlackUser(body.user?.id || '');

    if (pinned) {
      pinned.page = targetPage;
    }

    try {
      const blocks = await buildPageBlocks(userId, targetPage);
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: 'OpticData Live Dashboard',
      });
    } catch (err) {
      console.error('[Slack Bot] Page nav error:', err);
    }
  });

  // No-op for the page indicator button
  slackApp.action('dash_page_info', async ({ ack }: { ack: any }) => {
    await ack();
  });

  // /optic slash command
  slackApp.command('/optic', async ({ command, ack, respond, client }: { command: any; ack: any; respond: any; client: any }) => {
    await ack();
    const args = command.text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase() || 'help';
    const userId = await resolveSlackUser(command.user_id);

    try {
      if (subCommand === 'status' || subCommand === 'dashboard') {
        const blocks = await buildPageBlocks(userId, 0);
        await respond({ blocks, response_type: 'ephemeral' });

      } else if (subCommand === 'pin') {
        const channelId = command.channel_id;

        // Remove existing pinned dashboard in this channel
        pinnedDashboards.delete(channelId);

        const blocks = await buildPageBlocks(userId, 0);
        let postResult;
        try {
          try {
            await client.conversations.join({ channel: channelId });
          } catch { /* already in or private */ }
          postResult = await client.chat.postMessage({
            channel: channelId,
            blocks,
            text: 'OpticData Live Dashboard',
          });
        } catch (postErr: any) {
          const slackError = postErr?.data?.error || postErr?.message || 'unknown';
          console.error('[Slack Bot] postMessage failed:', channelId, slackError);
          if (slackError === 'channel_not_found' || slackError === 'not_in_channel') {
            await respond({ text: ':warning: Bot cannot post in this channel. Go to channel settings > Integrations > Add Apps and add OpticData. Then retry `/optic pin`.', response_type: 'ephemeral' });
          } else {
            await respond({ text: `:warning: Failed to post dashboard: \`${slackError}\`. Check bot scopes and channel permissions.`, response_type: 'ephemeral' });
          }
          return;
        }

        if (postResult.ok && postResult.ts) {
          try {
            await client.pins.add({ channel: channelId, timestamp: postResult.ts });
          } catch { /* pin may fail — dashboard still works */ }

          pinnedDashboards.set(channelId, { ts: postResult.ts, userId, page: 0 });
          await respond({ text: ':white_check_mark: Live dashboard pinned! Use the arrow buttons to navigate pages. Auto-updates on new data. `/optic unpin` to stop.', response_type: 'ephemeral' });
        }

      } else if (subCommand === 'unpin') {
        const channelId = command.channel_id;
        const pinned = pinnedDashboards.get(channelId);
        if (pinned) {
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
        await respond({
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `ROAS today: *${m.roas.toFixed(2)}x* (${$(m.revenue)} rev / ${$(m.spend)} spend)` } },
            dashboardLinkBlock(),
          ],
          response_type: 'ephemeral',
        });
      } else if (subCommand === 'spend') {
        const m = await fetchFullMetrics(userId);
        await respond({
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `Ad spend today: *${$(m.spend)}* | CPC ${$(m.cpc)} | CPM ${$(m.cpm)}` } },
            dashboardLinkBlock(),
          ],
          response_type: 'ephemeral',
        });
      } else if (subCommand === 'cpa') {
        const m = await fetchFullMetrics(userId);
        await respond({
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `CPA today: *${$(m.cpa)}* | CAC ${$(m.cac)} | ${m.conversions} conversions (${m.newCustomers} new)` } },
            dashboardLinkBlock(),
          ],
          response_type: 'ephemeral',
        });
      } else if (subCommand === 'revenue') {
        const m = await fetchFullMetrics(userId);
        const profit = m.revenue - m.spend;
        await respond({
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `Revenue today: *${$(m.revenue)}* from ${m.conversions} orders | P/L: ${profit >= 0 ? '+' : ''}${$(profit)}` } },
            dashboardLinkBlock(),
          ],
          response_type: 'ephemeral',
        });
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
                  '`/optic pin` — Post & pin live dashboard to channel',
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

  const systemPrompt = `You are OpticData's AI assistant responding via Slack. Be concise. Format with Slack mrkdwn (not markdown). Current date: ${new Date().toISOString().split('T')[0]}

You have access to tools that can query real-time campaign metrics, order data, offers, ROAS by campaign, traffic sources, automation rules, historical data, and more. Always use tools to fetch fresh data rather than guessing.`;

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];

  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    tools: operatorTools,
  });

  // Tool-use loop
  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      try {
        const { result } = await executeTool(block.name, block.input as Record<string, any>, userId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: err.message || 'Tool execution failed' }),
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools: operatorTools,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text || 'No response generated.';
}

export function getSlackApp(): App | null {
  return slackApp;
}
