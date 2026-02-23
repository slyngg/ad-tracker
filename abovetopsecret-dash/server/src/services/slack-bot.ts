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
const DEBOUNCE_MS = 3000;

// ----- Data Types -----

interface FullMetrics {
  spend: number; revenue: number; roas: number; cpa: number;
  conversions: number; clicks: number; impressions: number;
  lpViews: number; newCustomers: number;
  cpc: number; cpm: number; cvr: number;
  hookRate: number; ctr: number; cac: number;
}

interface DetailRow {
  label: string;
  // Core
  spend: number; revenue: number; roas: number;
  conversions: number; clicks: number; impressions: number;
  // Derived
  cpa: number; cpc: number; cpm: number; cvr: number; ctr: number;
  // Extended (available on some pages)
  lpViews: number; hookRate: number;
  newCustomers: number; aov: number;
  adSets: number; ads: number; campaigns: number;
  profit: number;
}

// ----- Helpers -----

function derive(r: { spend: number; revenue: number; conversions: number; clicks: number; impressions: number; lpViews: number; newCustomers: number }): Pick<DetailRow, 'roas' | 'cpa' | 'cpc' | 'cpm' | 'cvr' | 'ctr' | 'hookRate' | 'aov' | 'profit'> {
  return {
    roas: r.spend > 0 ? r.revenue / r.spend : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
    cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0,
    cvr: r.clicks > 0 ? (r.conversions / r.clicks) * 100 : 0,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    hookRate: r.impressions > 0 ? (r.lpViews / r.impressions) * 100 : 0,
    aov: r.conversions > 0 ? r.revenue / r.conversions : 0,
    profit: r.revenue - r.spend,
  };
}

// ----- Data Fetchers -----

async function fetchFullMetrics(userId: number | null): Promise<FullMetrics> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const [ads, orders] = await Promise.all([
    pool.query(`
      WITH all_ads AS (
        SELECT spend, clicks, impressions, landing_page_views AS lp_views FROM fb_ads_today ${uf}
        UNION ALL
        SELECT spend, clicks, impressions, 0 AS lp_views FROM tiktok_ads_today ${uf}
        UNION ALL
        SELECT spend, clicks, impressions, 0 AS lp_views FROM newsbreak_ads_today ${uf}
      )
      SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(clicks),0) AS clicks,
      COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(lp_views),0) AS lp_views
      FROM all_ads`, params),
    pool.query(`SELECT COALESCE(SUM(COALESCE(subtotal,revenue)),0) AS revenue,
      COUNT(DISTINCT order_id) AS conversions,
      COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
      FROM cc_orders_today WHERE order_status='completed' AND (is_test = false OR is_test IS NULL) ${ufAnd}`, params),
  ]);

  const a = ads.rows[0]; const o = orders.rows[0];
  const spend = parseFloat(a.spend) || 0;
  const revenue = parseFloat(o.revenue) || 0;
  const conversions = parseInt(o.conversions) || 0;
  const clicks = parseInt(a.clicks) || 0;
  const impressions = parseInt(a.impressions) || 0;
  const lpViews = parseInt(a.lp_views) || 0;
  const newCustomers = parseInt(o.new_customers) || 0;
  const d = derive({ spend, revenue, conversions, clicks, impressions, lpViews, newCustomers });
  return {
    spend, revenue, conversions, clicks, impressions, lpViews, newCustomers,
    roas: d.roas, cpa: d.cpa, cpc: d.cpc, cpm: d.cpm, cvr: d.cvr,
    ctr: d.ctr, hookRate: d.hookRate, cac: newCustomers > 0 ? spend / newCustomers : 0,
  };
}

async function fetchCampaignDetail(userId: number | null): Promise<DetailRow[]> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH all_ads AS (
      SELECT campaign_name, ad_set_name, ad_name, spend, clicks, impressions, landing_page_views AS lp_views
      FROM fb_ads_today ${uf}
      UNION ALL
      SELECT campaign_name, adgroup_name AS ad_set_name, ad_name, spend, clicks, impressions, 0 AS lp_views
      FROM tiktok_ads_today ${uf}
      UNION ALL
      SELECT campaign_name, adset_name AS ad_set_name, ad_name, spend, clicks, impressions, 0 AS lp_views
      FROM newsbreak_ads_today ${uf}
    ),
    ad_agg AS (
      SELECT campaign_name,
             SUM(spend) AS spend, SUM(clicks) AS clicks,
             SUM(impressions) AS impressions, SUM(lp_views) AS lp_views,
             COUNT(DISTINCT ad_set_name) AS ad_sets, COUNT(DISTINCT ad_name) AS ads
      FROM all_ads
      GROUP BY campaign_name
    ),
    cc AS (
      SELECT utm_campaign,
             COALESCE(SUM(COALESCE(subtotal,revenue)),0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions,
             COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
      FROM cc_orders_today WHERE order_status='completed' AND (is_test = false OR is_test IS NULL) ${ufAnd}
      GROUP BY utm_campaign
    )
    SELECT ad_agg.campaign_name AS label,
           COALESCE(ad_agg.spend,0)::float AS spend,
           COALESCE(cc.revenue,0)::float AS revenue,
           COALESCE(ad_agg.clicks,0)::int AS clicks,
           COALESCE(ad_agg.impressions,0)::int AS impressions,
           COALESCE(ad_agg.lp_views,0)::int AS lp_views,
           COALESCE(cc.conversions,0)::int AS conversions,
           COALESCE(cc.new_customers,0)::int AS new_customers,
           COALESCE(ad_agg.ad_sets,0)::int AS ad_sets,
           COALESCE(ad_agg.ads,0)::int AS ads
    FROM ad_agg LEFT JOIN cc ON ad_agg.campaign_name = cc.utm_campaign
    ORDER BY ad_agg.spend DESC LIMIT 8
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    const lpViews = parseInt(r.lp_views) || 0;
    const newCustomers = parseInt(r.new_customers) || 0;
    const d = derive({ spend, revenue, conversions, clicks, impressions, lpViews, newCustomers });
    return {
      label: r.label || 'Unknown', spend, revenue, conversions, clicks, impressions,
      lpViews, newCustomers,
      adSets: parseInt(r.ad_sets) || 0, ads: parseInt(r.ads) || 0, campaigns: 0,
      ...d,
    };
  });
}

async function fetchOfferDetail(userId: number | null): Promise<DetailRow[]> {
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const uf = userId ? 'WHERE user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH cc AS (
      SELECT offer_name,
             COALESCE(SUM(COALESCE(subtotal,revenue)),0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions,
             COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers,
             COALESCE(AVG(quantity),1) AS avg_qty,
             COUNT(DISTINCT utm_source) AS sources
      FROM cc_orders_today WHERE order_status='completed' AND (is_test = false OR is_test IS NULL) ${ufAnd}
      GROUP BY offer_name
    ),
    all_ads AS (
      SELECT ad_set_name AS adset_key, spend, clicks, impressions, landing_page_views AS lp_views
      FROM fb_ads_today ${uf}
      UNION ALL
      SELECT adgroup_name AS adset_key, spend, clicks, impressions, 0 AS lp_views
      FROM tiktok_ads_today ${uf}
      UNION ALL
      SELECT adset_name AS adset_key, spend, clicks, impressions, 0 AS lp_views
      FROM newsbreak_ads_today ${uf}
    ),
    ad_agg AS (
      SELECT adset_key,
             SUM(spend) AS spend, SUM(clicks) AS clicks,
             SUM(impressions) AS impressions, SUM(lp_views) AS lp_views
      FROM all_ads
      GROUP BY adset_key
    )
    SELECT cc.offer_name AS label,
           COALESCE(ad_agg.spend,0)::float AS spend,
           cc.revenue::float,
           COALESCE(ad_agg.clicks,0)::int AS clicks,
           COALESCE(ad_agg.impressions,0)::int AS impressions,
           COALESCE(ad_agg.lp_views,0)::int AS lp_views,
           cc.conversions::int,
           cc.new_customers::int,
           ROUND(cc.avg_qty::numeric,1) AS avg_qty,
           cc.sources::int
    FROM cc LEFT JOIN ad_agg ON ad_agg.adset_key = cc.offer_name
    ORDER BY cc.revenue DESC LIMIT 8
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    const lpViews = parseInt(r.lp_views) || 0;
    const newCustomers = parseInt(r.new_customers) || 0;
    const d = derive({ spend, revenue, conversions, clicks, impressions, lpViews, newCustomers });
    return {
      label: r.label || 'Unknown', spend, revenue, conversions, clicks, impressions,
      lpViews, newCustomers,
      adSets: 0, ads: 0, campaigns: 0,
      ...d,
    };
  });
}

async function fetchAccountDetail(userId: number | null): Promise<DetailRow[]> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const result = await pool.query(`
    WITH all_ads AS (
      SELECT account_name, campaign_name, ad_set_name, ad_name, spend, clicks, impressions, landing_page_views AS lp_views
      FROM fb_ads_today ${uf}
      UNION ALL
      SELECT a.name AS account_name, t.campaign_name, t.adgroup_name AS ad_set_name, t.ad_name, t.spend, t.clicks, t.impressions, 0 AS lp_views
      FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id
      ${uf.replace('WHERE', 'WHERE t.')}
      UNION ALL
      SELECT a.name AS account_name, n.campaign_name, n.adset_name AS ad_set_name, n.ad_name, n.spend, n.clicks, n.impressions, 0 AS lp_views
      FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id
      ${uf.replace('WHERE', 'WHERE n.')}
    ),
    ad_agg AS (
      SELECT account_name,
             SUM(spend) AS spend, SUM(clicks) AS clicks,
             SUM(impressions) AS impressions, SUM(lp_views) AS lp_views,
             COUNT(DISTINCT campaign_name) AS campaigns,
             COUNT(DISTINCT ad_set_name) AS ad_sets, COUNT(DISTINCT ad_name) AS ads
      FROM all_ads
      GROUP BY account_name
    ),
    totals AS (
      SELECT COALESCE(SUM(spend),0) AS total_spend FROM all_ads
    ),
    rev AS (
      SELECT COALESCE(SUM(COALESCE(subtotal,revenue)),0) AS total_revenue,
             COUNT(DISTINCT order_id) AS total_conversions,
             COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS total_new
      FROM cc_orders_today WHERE order_status='completed' AND (is_test = false OR is_test IS NULL) ${ufAnd}
    )
    SELECT ad_agg.account_name AS label,
           ad_agg.spend::float, ad_agg.clicks::int, ad_agg.impressions::int, ad_agg.lp_views::int,
           ad_agg.campaigns::int, ad_agg.ad_sets::int, ad_agg.ads::int,
           CASE WHEN totals.total_spend > 0
             THEN (ad_agg.spend / totals.total_spend * rev.total_revenue) ELSE 0 END::float AS revenue,
           CASE WHEN totals.total_spend > 0
             THEN ROUND(ad_agg.spend / totals.total_spend * rev.total_conversions) ELSE 0 END::int AS conversions,
           CASE WHEN totals.total_spend > 0
             THEN ROUND(ad_agg.spend / totals.total_spend * rev.total_new) ELSE 0 END::int AS new_customers
    FROM ad_agg, totals, rev
    ORDER BY ad_agg.spend DESC LIMIT 8
  `, params);

  return result.rows.map((r: any) => {
    const spend = parseFloat(r.spend) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const conversions = parseInt(r.conversions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const impressions = parseInt(r.impressions) || 0;
    const lpViews = parseInt(r.lp_views) || 0;
    const newCustomers = parseInt(r.new_customers) || 0;
    const d = derive({ spend, revenue, conversions, clicks, impressions, lpViews, newCustomers });
    return {
      label: r.label || 'Unknown', spend, revenue, conversions, clicks, impressions,
      lpViews, newCustomers,
      campaigns: parseInt(r.campaigns) || 0,
      adSets: parseInt(r.ad_sets) || 0,
      ads: parseInt(r.ads) || 0,
      ...d,
    };
  });
}

// Lightweight fetchers for overview (reuse the detail ones)
const fetchAccountBreakdown = fetchAccountDetail;
const fetchOfferBreakdown = fetchOfferDetail;

// ----- Formatters -----

function $(n: number): string {
  if (Math.abs(n) >= 10000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function pct(n: number): string { return `${n.toFixed(1)}%`; }
function num(n: number): string { return n.toLocaleString(); }

function roasEmoji(roas: number): string {
  if (roas >= 3) return ':rocket:';
  if (roas >= 2) return ':large_green_circle:';
  if (roas >= 1) return ':large_yellow_circle:';
  return ':red_circle:';
}

function statusEmoji(roas: number): string {
  if (roas >= 2.5) return ':large_green_circle:';
  if (roas >= 1.5) return ':large_yellow_circle:';
  if (roas >= 1.0) return ':large_orange_circle:';
  if (roas > 0) return ':red_circle:';
  return ':white_circle:';
}

function plStr(n: number): string {
  return `${n >= 0 ? '+' : ''}${$(n)}`;
}

async function resolveSlackUser(_slackUserId: string): Promise<number | null> {
  try {
    const result = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
    return result.rows[0]?.id || null;
  } catch { return null; }
}

const dashboardUrl = process.env.DASHBOARD_URL || 'https://optic-data.com';
function dashboardLinkBlock(): any {
  return { type: 'context', elements: [{ type: 'mrkdwn', text: `<${dashboardUrl}|View full dashboard>` }] };
}

// ----- Block Kit Builders -----

function buildNavButtons(currentPage: number): any[] {
  const dots = PAGE_NAMES.map((name, i) =>
    i === currentPage ? `*${name}*` : name
  ).join('  ');

  const elements: any[] = [];
  if (currentPage > 0) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: ':arrow_left: Prev', emoji: true },
      action_id: 'dash_prev', value: String(currentPage - 1),
    });
  }
  elements.push({
    type: 'button',
    text: { type: 'plain_text', text: `${currentPage + 1}/${TOTAL_PAGES}`, emoji: true },
    action_id: 'dash_page_info', value: String(currentPage),
  });
  if (currentPage < TOTAL_PAGES - 1) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Next :arrow_right:', emoji: true },
      action_id: 'dash_next', value: String(currentPage + 1),
    });
  }
  return [
    { type: 'context', elements: [{ type: 'mrkdwn', text: dots }] },
    { type: 'actions', elements },
  ];
}

function buildHeaderBlocks(m: FullMetrics): any[] {
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  const profit = m.revenue - m.spend;
  return [
    { type: 'header', text: { type: 'plain_text', text: 'OpticData Live Dashboard' } },
    { type: 'context', elements: [{
      type: 'mrkdwn',
      text: `:clock1: Updated ${now} ET  |  ${roasEmoji(m.roas)} ROAS ${m.roas.toFixed(2)}x  |  P/L ${plStr(profit)}  |  ${num(m.conversions)} orders`,
    }] },
    { type: 'divider' },
  ];
}

// ----- Page 0: Command Center -----

async function buildOverviewPage(userId: number | null, m: FullMetrics): Promise<any[]> {
  const [accounts, offers] = await Promise.all([
    fetchAccountBreakdown(userId),
    fetchOfferBreakdown(userId),
  ]);

  const blocks: any[] = [];
  const profit = m.revenue - m.spend;
  const margin = m.revenue > 0 ? (profit / m.revenue) * 100 : 0;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn',
      text: `:bank: *P&L*:  ${$(m.revenue)} rev  −  ${$(m.spend)} spend  =  *${plStr(profit)}*  (${pct(margin)} margin)` },
  });

  // Per-Account
  blocks.push({ type: 'divider' });
  if (accounts.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':office: *Ad Accounts*\n_No ad data yet today._' } });
  } else {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':office: *Ad Accounts*' } });
    for (const a of accounts.slice(0, 5)) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn',
        text: `${statusEmoji(a.roas)} *${a.label.substring(0, 30)}*\n`
          + `Spend ${$(a.spend)}  |  Rev ${$(a.revenue)}  |  ROAS ${a.roas.toFixed(2)}x  |  CPA ${$(a.cpa)}  |  P/L ${plStr(a.profit)}` } });
    }
  }

  // Per-Offer
  blocks.push({ type: 'divider' });
  if (offers.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':shopping_bags: *Offers*\n_No order data yet today._' } });
  } else {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':shopping_bags: *Offers*' } });
    for (const o of offers.slice(0, 5)) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn',
        text: `${statusEmoji(o.roas)} *${o.label.substring(0, 30)}*\n`
          + `${$(o.revenue)} rev  |  ${o.conversions} orders  |  ROAS ${o.roas.toFixed(2)}x  |  CPA ${$(o.cpa)}  |  P/L ${plStr(o.profit)}` } });
    }
  }

  // Alerts
  const bleeders = [...accounts, ...offers].filter(r => r.spend > 5 && r.roas < 1.0);
  if (bleeders.length > 0) {
    blocks.push({ type: 'divider' });
    const lines = bleeders.slice(0, 3).map(b =>
      `:warning: *${b.label.substring(0, 20)}* — ROAS ${b.roas.toFixed(2)}x, burning ${$(b.spend - b.revenue)}`
    );
    blocks.push({ type: 'section', text: { type: 'mrkdwn',
      text: `:rotating_light: *Needs Attention*\n${lines.join('\n')}` } });
  }

  return blocks;
}

// ----- Page 1: Campaigns Deep Dive -----

function buildCampaignCards(rows: DetailRow[]): any[] {
  if (rows.length === 0) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: ':bar_chart: *Campaigns*\n_No campaign data yet today._' } },
    ];
  }

  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: ':bar_chart: *Campaigns Deep Dive*' } },
  ];

  for (const c of rows) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn',
        text: `${statusEmoji(c.roas)} *${c.label.substring(0, 40)}*   _(${c.adSets} ad sets, ${c.ads} ads)_` },
    });
    // Row 1: Money metrics
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend*\n${$(c.spend)}` },
        { type: 'mrkdwn', text: `*Revenue*\n${$(c.revenue)}` },
        { type: 'mrkdwn', text: `*ROAS*\n${c.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `*P/L*\n${plStr(c.profit)}` },
      ],
    });
    // Row 2: Efficiency
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CPA*\n${$(c.cpa)}` },
        { type: 'mrkdwn', text: `*CPC*\n${$(c.cpc)}` },
        { type: 'mrkdwn', text: `*CPM*\n${$(c.cpm)}` },
        { type: 'mrkdwn', text: `*CVR*\n${pct(c.cvr)}` },
      ],
    });
    // Row 3: Engagement
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CTR*\n${pct(c.ctr)}` },
        { type: 'mrkdwn', text: `*Hook Rate*\n${pct(c.hookRate)}` },
        { type: 'mrkdwn', text: `*Clicks*\n${num(c.clicks)}` },
        { type: 'mrkdwn', text: `*Impressions*\n${num(c.impressions)}` },
      ],
    });
    // Row 4: Volume
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*LP Views*\n${num(c.lpViews)}` },
        { type: 'mrkdwn', text: `*Orders*\n${num(c.conversions)}` },
        { type: 'mrkdwn', text: `*New Customers*\n${num(c.newCustomers)}` },
        { type: 'mrkdwn', text: `*AOV*\n${$(c.aov)}` },
      ],
    });
  }
  return blocks;
}

// ----- Page 2: Offers Deep Dive -----

function buildOfferCards(rows: DetailRow[]): any[] {
  if (rows.length === 0) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: ':shopping_bags: *Offers*\n_No order data yet today._' } },
    ];
  }

  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: ':shopping_bags: *Offers Deep Dive*' } },
  ];

  for (const o of rows) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn',
        text: `${statusEmoji(o.roas)} *${o.label.substring(0, 40)}*` },
    });
    // Row 1: Revenue
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Revenue*\n${$(o.revenue)}` },
        { type: 'mrkdwn', text: `*Orders*\n${num(o.conversions)}` },
        { type: 'mrkdwn', text: `*AOV*\n${$(o.aov)}` },
        { type: 'mrkdwn', text: `*New Customers*\n${num(o.newCustomers)}` },
      ],
    });
    // Row 2: Ad performance (if matched)
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend*\n${o.spend > 0 ? $(o.spend) : '—'}` },
        { type: 'mrkdwn', text: `*ROAS*\n${o.spend > 0 ? o.roas.toFixed(2) + 'x' : '—'}` },
        { type: 'mrkdwn', text: `*CPA*\n${o.spend > 0 ? $(o.cpa) : '—'}` },
        { type: 'mrkdwn', text: `*P/L*\n${o.spend > 0 ? plStr(o.profit) : '—'}` },
      ],
    });
    // Row 3: Funnel (if ad data linked)
    if (o.clicks > 0 || o.impressions > 0) {
      blocks.push({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*CPC*\n${$(o.cpc)}` },
          { type: 'mrkdwn', text: `*CPM*\n${$(o.cpm)}` },
          { type: 'mrkdwn', text: `*CVR*\n${pct(o.cvr)}` },
          { type: 'mrkdwn', text: `*Hook Rate*\n${pct(o.hookRate)}` },
        ],
      });
      blocks.push({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Clicks*\n${num(o.clicks)}` },
          { type: 'mrkdwn', text: `*Impressions*\n${num(o.impressions)}` },
          { type: 'mrkdwn', text: `*LP Views*\n${num(o.lpViews)}` },
          { type: 'mrkdwn', text: `*CTR*\n${pct(o.ctr)}` },
        ],
      });
    }
  }
  return blocks;
}

// ----- Page 3: Accounts Deep Dive -----

function buildAccountCards(rows: DetailRow[]): any[] {
  if (rows.length === 0) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: ':office: *Ad Accounts*\n_No ad data yet today._' } },
    ];
  }

  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: ':office: *Ad Accounts Deep Dive*' } },
  ];

  for (const a of rows) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn',
        text: `${statusEmoji(a.roas)} *${a.label.substring(0, 40)}*   _(${a.campaigns} campaigns, ${a.adSets} ad sets, ${a.ads} ads)_` },
    });
    // Row 1: Money
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend*\n${$(a.spend)}` },
        { type: 'mrkdwn', text: `*Revenue*\n${$(a.revenue)}` },
        { type: 'mrkdwn', text: `*ROAS*\n${a.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `*P/L*\n${plStr(a.profit)}` },
      ],
    });
    // Row 2: Efficiency
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CPA*\n${$(a.cpa)}` },
        { type: 'mrkdwn', text: `*CPC*\n${$(a.cpc)}` },
        { type: 'mrkdwn', text: `*CPM*\n${$(a.cpm)}` },
        { type: 'mrkdwn', text: `*CVR*\n${pct(a.cvr)}` },
      ],
    });
    // Row 3: Engagement
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CTR*\n${pct(a.ctr)}` },
        { type: 'mrkdwn', text: `*Hook Rate*\n${pct(a.hookRate)}` },
        { type: 'mrkdwn', text: `*Clicks*\n${num(a.clicks)}` },
        { type: 'mrkdwn', text: `*Impressions*\n${num(a.impressions)}` },
      ],
    });
    // Row 4: Volume
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*LP Views*\n${num(a.lpViews)}` },
        { type: 'mrkdwn', text: `*Orders*\n${num(a.conversions)}` },
        { type: 'mrkdwn', text: `*New Customers*\n${num(a.newCustomers)}` },
        { type: 'mrkdwn', text: `*AOV*\n${$(a.aov)}` },
      ],
    });
  }
  return blocks;
}

// ----- Page Assembly -----

async function buildPageBlocks(userId: number | null, page: number): Promise<any[]> {
  const m = await fetchFullMetrics(userId);
  const blocks: any[] = [...buildHeaderBlocks(m)];

  if (page === 0) {
    blocks.push(...await buildOverviewPage(userId, m));
  } else if (page === 1) {
    // Limit to top 4 campaigns for deep dive (5 blocks each × 4 = 20, fits in 50 block limit)
    const campaigns = await fetchCampaignDetail(userId);
    blocks.push(...buildCampaignCards(campaigns.slice(0, 4)));
  } else if (page === 2) {
    const offers = await fetchOfferDetail(userId);
    blocks.push(...buildOfferCards(offers.slice(0, 4)));
  } else if (page === 3) {
    const accounts = await fetchAccountDetail(userId);
    blocks.push(...buildAccountCards(accounts.slice(0, 4)));
  }

  blocks.push({ type: 'divider' });
  blocks.push(...buildNavButtons(page));
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_Auto-refreshes on new data  |  /optic unpin to stop_' }] });
  blocks.push(dashboardLinkBlock());

  return blocks;
}

// ----- Real-time dashboard refresh -----

export function refreshPinnedDashboards(userId: number | null): void {
  if (!slackApp || pinnedDashboards.size === 0) return;

  for (const [channelId, pinned] of pinnedDashboards.entries()) {
    if (userId !== null && pinned.userId !== null && pinned.userId !== userId) continue;

    const pending = updateDebounce.get(channelId);
    if (pending) clearTimeout(pending);

    updateDebounce.set(channelId, setTimeout(async () => {
      updateDebounce.delete(channelId);
      try {
        const updatedBlocks = await buildPageBlocks(pinned.userId, pinned.page);
        await slackApp!.client.chat.update({
          channel: channelId, ts: pinned.ts, blocks: updatedBlocks, text: 'OpticData Live Dashboard',
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
    token, signingSecret,
    ...(appToken ? { socketMode: true, appToken } : {}),
    logLevel: LogLevel.WARN,
  });

  // ----- Pagination button handlers -----

  const handlePageNav = async ({ ack, body, client }: { ack: any; body: any; client: any }) => {
    await ack();
    const channelId = body.channel?.id || body.container?.channel_id;
    const messageTs = body.message?.ts || body.container?.message_ts;
    if (!channelId || !messageTs) return;

    const targetPage = parseInt(body.actions?.[0]?.value) || 0;
    const pinned = pinnedDashboards.get(channelId);
    const userId = pinned?.userId ?? await resolveSlackUser(body.user?.id || '');
    if (pinned) pinned.page = targetPage;

    try {
      const blocks = await buildPageBlocks(userId, targetPage);
      await client.chat.update({ channel: channelId, ts: messageTs, blocks, text: 'OpticData Live Dashboard' });
    } catch (err) {
      console.error('[Slack Bot] Page nav error:', err);
    }
  };

  slackApp.action('dash_prev', handlePageNav);
  slackApp.action('dash_next', handlePageNav);
  slackApp.action('dash_page_info', async ({ ack }: { ack: any }) => { await ack(); });

  // ----- /optic slash command -----

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
        pinnedDashboards.delete(channelId);

        const blocks = await buildPageBlocks(userId, 0);
        let postResult;
        try {
          try { await client.conversations.join({ channel: channelId }); } catch {}
          postResult = await client.chat.postMessage({ channel: channelId, blocks, text: 'OpticData Live Dashboard' });
        } catch (postErr: any) {
          const slackError = postErr?.data?.error || postErr?.message || 'unknown';
          console.error('[Slack Bot] postMessage failed:', channelId, slackError);
          if (slackError === 'channel_not_found' || slackError === 'not_in_channel') {
            await respond({ text: ':warning: Bot cannot post here. Go to channel settings > Integrations > Add Apps > OpticData. Then retry `/optic pin`.', response_type: 'ephemeral' });
          } else {
            await respond({ text: `:warning: Failed: \`${slackError}\``, response_type: 'ephemeral' });
          }
          return;
        }

        if (postResult.ok && postResult.ts) {
          try { await client.pins.add({ channel: channelId, timestamp: postResult.ts }); } catch {}
          pinnedDashboards.set(channelId, { ts: postResult.ts, userId, page: 0 });
          await respond({ text: ':white_check_mark: Live dashboard pinned! Use arrow buttons to navigate. Auto-updates on new data. `/optic unpin` to stop.', response_type: 'ephemeral' });
        }

      } else if (subCommand === 'unpin') {
        const channelId = command.channel_id;
        const pinned = pinnedDashboards.get(channelId);
        if (pinned) {
          const pending = updateDebounce.get(channelId);
          if (pending) { clearTimeout(pending); updateDebounce.delete(channelId); }
          try { await client.pins.remove({ channel: channelId, timestamp: pinned.ts }); } catch {}
          try { await client.chat.delete({ channel: channelId, ts: pinned.ts }); } catch {}
          pinnedDashboards.delete(channelId);
          await respond({ text: ':white_check_mark: Dashboard removed and auto-updates stopped.', response_type: 'ephemeral' });
        } else {
          await respond({ text: 'No pinned dashboard found in this channel.', response_type: 'ephemeral' });
        }

      } else if (subCommand === 'roas') {
        const m = await fetchFullMetrics(userId);
        await respond({ blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `ROAS today: *${m.roas.toFixed(2)}x* (${$(m.revenue)} rev / ${$(m.spend)} spend)` } },
          dashboardLinkBlock(),
        ], response_type: 'ephemeral' });
      } else if (subCommand === 'spend') {
        const m = await fetchFullMetrics(userId);
        await respond({ blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `Ad spend today: *${$(m.spend)}* | CPC ${$(m.cpc)} | CPM ${$(m.cpm)}` } },
          dashboardLinkBlock(),
        ], response_type: 'ephemeral' });
      } else if (subCommand === 'cpa') {
        const m = await fetchFullMetrics(userId);
        await respond({ blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `CPA today: *${$(m.cpa)}* | CAC ${$(m.cac)} | ${m.conversions} conversions (${m.newCustomers} new)` } },
          dashboardLinkBlock(),
        ], response_type: 'ephemeral' });
      } else if (subCommand === 'revenue') {
        const m = await fetchFullMetrics(userId);
        const profit = m.revenue - m.spend;
        await respond({ blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `Revenue today: *${$(m.revenue)}* from ${m.conversions} orders | P/L: ${plStr(profit)}` } },
          dashboardLinkBlock(),
        ], response_type: 'ephemeral' });
      } else if (subCommand === 'ask') {
        const question = args.slice(1).join(' ');
        if (!question) { await respond('Usage: `/optic ask <your question>`'); return; }
        const answer = await askOperatorAI(question, userId);
        await respond(answer);
      } else {
        await respond({ blocks: [
          { type: 'header', text: { type: 'plain_text', text: ':zap: OpticData Command Center — Full Guide' } },

          // --- Slash Commands ---
          { type: 'section', text: { type: 'mrkdwn', text: '*:keyboard: Slash Commands*' } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            '`/optic status` — Full dashboard with P/L, accounts, offers & alerts (private)',
            '`/optic pin` — Pin a live dashboard to this channel (auto-updates on new data)',
            '`/optic unpin` — Remove pinned dashboard & stop auto-updates',
            '`/optic roas` — Quick ROAS check: revenue / spend',
            '`/optic spend` — Today\'s ad spend + CPC + CPM',
            '`/optic cpa` — Cost per acquisition + CAC + conversion count',
            '`/optic revenue` — Revenue total + P/L',
            '`/optic ask <question>` — Ask the AI anything (see below)',
            '`/optic help` — This guide',
          ].join('\n') } },
          { type: 'divider' },

          // --- Live Dashboard ---
          { type: 'section', text: { type: 'mrkdwn', text: '*:bar_chart: Live Dashboard Pages* (use arrow buttons to navigate)' } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            '*Page 1 — Command Center Overview*',
            '  P/L summary, per-account cards (Spend, Rev, ROAS, CPA, P/L), per-offer cards, :rotating_light: bleeding-money alerts',
            '*Page 2 — Campaigns Deep Dive*',
            '  Per-campaign: Spend, Rev, ROAS, P/L, CPA, CPC, CPM, CVR, CTR, Hook Rate, Clicks, Impressions, LP Views, Orders, New Customers, AOV, Ad Set & Ad counts',
            '*Page 3 — Offers Deep Dive*',
            '  Per-offer: Revenue, Orders, AOV, New Customers, Spend, ROAS, CPA, P/L, CPC, CPM, CVR, Hook Rate, CTR, Clicks, Impressions, LP Views',
            '*Page 4 — Ad Accounts Deep Dive*',
            '  Per-account: Spend, Rev, ROAS, P/L, CPA, CPC, CPM, CVR, CTR, Hook Rate, Clicks, Impressions, LP Views, Orders, New Customers, AOV + Campaign/AdSet/Ad counts',
          ].join('\n') } },
          { type: 'divider' },

          // --- AI Agent: Data Queries ---
          { type: 'section', text: { type: 'mrkdwn', text: '*:robot_face: AI Agent — Ask Anything*\nUse `/optic ask` or `@OpticData` to chat with the AI. It has 15 real-time tools:' } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            '*:mag: Data & Analytics*',
            '• *Campaign Metrics* — Spend, clicks, impressions, CPC, CTR per campaign',
            '• *Adset Metrics* — Adset-level breakdown with spend, clicks, CPC',
            '• *Order Stats* — Revenue, conversions, AOV summary',
            '• *Top Offers* — Offers ranked by revenue',
            '• *ROAS by Campaign* — ROAS per campaign (ad spend vs. order revenue)',
            '• *Source/Medium* — Traffic source breakdown (UTM source & medium)',
            '• *Historical Data* — Query past performance by day, campaign, or adset for any date range',
            '• *Custom SQL* — Run any read-only query against your data',
          ].join('\n') } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            '*:joystick: Meta Ads Actions*',
            '• *Pause Adset* — Instantly pause any adset to stop delivery',
            '• *Enable Adset* — Re-activate a paused adset',
            '• *Adjust Budget* — Change an adset\'s daily budget to any amount',
          ].join('\n') } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            '*:gear: Automation & Alerts*',
            '• *List Rules* — See all your automation rules + status',
            '• *Create Rule* — Build rules like "if CPA > $50, pause adset X"',
            '• *Toggle Rule* — Enable/disable any automation rule',
            '• *Send Notification* — Push an alert to your dashboard + Slack',
          ].join('\n') } },
          { type: 'divider' },

          // --- Example Prompts ---
          { type: 'section', text: { type: 'mrkdwn', text: '*:speech_balloon: Example Prompts — Try These*' } },
          { type: 'section', text: { type: 'mrkdwn', text: [
            ':chart_with_upwards_trend: _"What\'s my best performing campaign today?"_',
            ':chart_with_downwards_trend: _"Which adsets are bleeding money? Show me anything with ROAS under 1.0"_',
            ':pause_button: _"Pause adset 23851234567890"_',
            ':moneybag: _"Boost the budget on adset 23851234567890 to $200/day"_',
            ':arrows_counterclockwise: _"Re-enable adset 23851234567890"_',
            ':shopping_bags: _"What are my top 5 offers by revenue?"_',
            ':world_map: _"Break down my traffic by source and medium"_',
            ':calendar: _"Compare last week\'s spend vs this week by campaign"_',
            ':robot_face: _"Create a rule: if CPA goes above $40, pause adset 23851234567890"_',
            ':clipboard: _"List all my automation rules"_',
            ':bar_chart: _"Run SQL: SELECT campaign_name, SUM(spend) FROM fb_ads_today WHERE user_id=1 GROUP BY campaign_name"_',
            ':bell: _"Send me a notification saying \'Check your campaigns\'"_',
          ].join('\n') } },
          { type: 'divider' },

          // --- @mention ---
          { type: 'section', text: { type: 'mrkdwn', text: '*:bulb: Pro Tips*\n• Mention `@OpticData` in any channel to chat without using `/optic ask`\n• The pinned dashboard auto-refreshes every time new webhook data arrives\n• The AI remembers context within a conversation — ask follow-up questions\n• All data is scoped to your account — multi-tenant safe' } },
          dashboardLinkBlock(),
        ] });
      }
    } catch (err) {
      console.error('[Slack Bot] Command error:', err);
      await respond('Something went wrong. Please try again.');
    }
  });

  // @mention handler
  slackApp.event('app_mention', async ({ event, say }: { event: any; say: any }) => {
    const text = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    if (!text) {
      await say('Hi! Ask me anything about your ad performance.');
      return;
    }
    const userId = await resolveSlackUser(event.user);
    try {
      const answer = await askOperatorAI(text, userId);
      await say({ text: answer, thread_ts: event.ts });
    } catch (err) {
      console.error('[Slack Bot] Mention error:', err);
      await say({ text: 'Sorry, something went wrong.', thread_ts: event.ts });
    }
  });

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
    model: 'claude-sonnet-4-20250514', max_tokens: 2048,
    system: systemPrompt, messages, tools: operatorTools,
  });

  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      try {
        const { result } = await executeTool(block.name, block.input as Record<string, any>, userId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err: any) {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: err.message }), is_error: true });
      }
    }
    messages.push({ role: 'user', content: toolResults });
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 2048,
      system: systemPrompt, messages, tools: operatorTools,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text || 'No response generated.';
}

export function getSlackApp(): App | null {
  return slackApp;
}
