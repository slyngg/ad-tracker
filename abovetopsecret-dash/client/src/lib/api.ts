import { z } from 'zod';
import { getAuthToken } from '../stores/authStore';
import { getAccountFilterParams } from '../stores/accountStore';

const BASE_URL = '/api';

// ── Response schemas (runtime validation for critical data) ───

const summarySchema = z.object({
  total_spend: z.number(),
  total_revenue: z.number(),
  total_roi: z.number(),
  total_conversions: z.number(),
  previous: z.object({
    total_spend: z.number(),
    total_revenue: z.number(),
    total_roi: z.number(),
    total_conversions: z.number(),
  }).nullable().optional(),
});

const metricRowSchema = z.object({
  offer_name: z.string(),
  account_name: z.string(),
  spend: z.number(),
  revenue: z.number(),
  roi: z.number(),
  cpa: z.number(),
  conversions: z.number(),
}).passthrough();

/** Validate response data against a zod schema. Logs warning but does not throw. */
function validateResponse<T>(data: T, schema: z.ZodSchema, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[API] ${label} response validation failed:`, result.error.issues);
  }
  return data;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  return res.json();
}

export interface MetricRow {
  account_name: string;
  offer_name: string;
  spend: number;
  revenue: number;
  roi: number;
  cpa: number;
  aov: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cvr: number;
  conversions: number;
  new_customer_pct: number;
  lp_ctr: number;
  take_rate_1: number;
  take_rate_3: number;
  take_rate_5: number;
  subscription_pct: number;
  sub_take_rate_1: number;
  sub_take_rate_3: number;
  sub_take_rate_5: number;
  upsell_take_rate: number;
  upsell_decline_rate: number;
  _overrides?: Record<string, {
    original: number;
    override: number;
    set_by: string;
    set_at: string;
  }>;
}

export interface PreviousSummaryData {
  total_spend: number;
  total_revenue: number;
  total_roi: number;
  total_conversions: number;
}

export interface SummaryData {
  total_spend: number;
  total_revenue: number;
  total_roi: number;
  total_conversions: number;
  previous?: PreviousSummaryData | null;
}

export interface OverrideRow {
  id: number;
  metric_key: string;
  offer_name: string;
  override_value: number;
  set_by: string;
  set_at: string;
}

// --- Analytics types ---
export interface TimeseriesPoint {
  date: string;
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number;
}

export interface BreakdownItem {
  label: string;
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface FunnelData {
  impressions: number;
  clicks: number;
  lp_views: number;
  orders: number;
  upsells_offered: number;
  upsells_accepted: number;
}

// --- Costs types ---
export interface CostSetting {
  id: number;
  offer_name: string;
  cost_type: string;
  cost_value: number;
  cost_unit: string;
  notes?: string;
}

// --- Notifications types ---
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  data?: any;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPref {
  id?: number;
  channel: string;
  event_type: string;
  enabled: boolean;
  config?: any;
}

// --- Operator AI types ---
export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: {
    id: number;
    role: string;
    content: string;
    created_at: string;
  }[];
}

// --- Rules types ---
export interface Rule {
  id: number;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  action_meta?: any;
  enabled: boolean;
  cooldown_minutes?: number;
  last_fired_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface RuleLog {
  id: number;
  rule_id: number;
  triggered_at: string;
  trigger_data: any;
  action_result: any;
  status: string;
  error_message?: string;
}

// --- SQL Builder types ---
export interface SqlResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  duration: number;
}

export interface SavedQuery {
  id: number;
  name: string;
  sql_text: string;
  created_at: string;
}

export interface SchemaInfo {
  table_name: string;
  columns: {
    column_name: string;
    data_type: string;
    is_nullable: string;
  }[];
}

// --- API Keys types ---
export interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
}

// --- Upload types ---
export interface UploadResult {
  success: boolean;
  inserted: number;
  skipped: number;
  errors?: string[];
}

// --- Webhook Token types ---
export interface WebhookToken {
  id: number;
  token: string;
  source: string;
  label: string | null;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
}

// --- Pixel Config types ---
export interface PixelConfig {
  id: number;
  user_id: number;
  name: string;
  funnel_page: string;
  pixel_type: string;
  enabled: boolean;
  track_pageviews: boolean;
  track_conversions: boolean;
  track_upsells: boolean;
  custom_code: string | null;
  created_at: string;
  updated_at: string;
}

// --- Source/Medium types ---
export interface SourceMediumRow {
  utm_source: string;
  utm_medium: string;
  revenue: number;
  conversions: number;
  orders: number;
}

// --- P&L types ---
export interface PnLData {
  revenue: number;
  adSpend: number;
  cogs: number;
  netProfit: number;
  margin: number;
}

// --- Account & Offer types ---
export interface Account {
  id: number;
  name: string;
  platform: string;
  platform_account_id: string | null;
  has_access_token?: boolean;
  currency: string;
  timezone: string;
  status: string;
  color: string;
  icon: string | null;
  notes: string | null;
  brand_config_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: number;
  account_id: number | null;
  user_id: number;
  name: string;
  offer_type: string;
  identifier: string | null;
  utm_campaign_match: string | null;
  campaign_name_match: string | null;
  product_ids: string[];
  cogs: number;
  shipping_cost: number;
  handling_cost: number;
  gateway_fee_pct: number;
  gateway_fee_flat: number;
  target_cpa: number | null;
  target_roas: number | null;
  status: string;
  color: string;
  notes: string | null;
  brand_config_id: number | null;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountSummary {
  id: number;
  name: string;
  platform: string;
  color: string;
  status: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
}

// --- OAuth types ---
export interface OAuthStatus {
  platform: string;
  status: string;
  connectionMethod: string;
  tokenExpiresAt?: string;
  scopes?: string[];
  error?: string;
  updatedAt?: string;
}

// --- OAuth API ---
export function getOAuthAuthorizeUrl(platform: string, storeUrl?: string): Promise<{ authUrl: string }> {
  const params = new URLSearchParams();
  if (storeUrl) params.set('storeUrl', storeUrl);
  const qs = params.toString();
  return request<{ authUrl: string }>(`/oauth/${platform}/authorize${qs ? `?${qs}` : ''}`);
}

export function getOAuthStatus(): Promise<OAuthStatus[]> {
  return request<OAuthStatus[]>('/oauth/status');
}

export function disconnectOAuth(platform: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/oauth/${platform}/disconnect`, { method: 'POST' });
}

export function refreshOAuthToken(platform: string): Promise<{ success: boolean; expiresAt?: string }> {
  return request<{ success: boolean; expiresAt?: string }>(`/oauth/${platform}/refresh`, { method: 'POST' });
}

export function fetchMetrics(offer?: string, account?: string): Promise<MetricRow[]> {
  const params = new URLSearchParams();
  if (offer && offer !== 'All') params.set('offer', offer);
  if (account && account !== 'All') params.set('account', account);
  // Merge account store filters
  const af = getAccountFilterParams();
  af.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const qs = params.toString();
  return request<MetricRow[]>(`/metrics${qs ? `?${qs}` : ''}`).then(
    (data) => validateResponse(data, z.array(metricRowSchema), 'fetchMetrics')
  );
}

export function fetchSummary(): Promise<SummaryData> {
  const af = getAccountFilterParams();
  const qs = af.toString();
  return request<SummaryData>(`/metrics/summary${qs ? `?${qs}` : ''}`).then(
    (data) => validateResponse(data, summarySchema, 'fetchSummary')
  );
}

export function fetchOverrides(): Promise<OverrideRow[]> {
  return request<OverrideRow[]>('/overrides');
}

export function createOverride(data: {
  metric_key: string;
  offer_name: string;
  override_value: number;
  set_by: string;
}): Promise<OverrideRow> {
  return request<OverrideRow>('/overrides', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteOverride(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/overrides/${id}`, { method: 'DELETE' });
}

export function triggerFBSync(): Promise<{ synced: number; accounts: number; skipped: boolean }> {
  return request('/sync/facebook', { method: 'POST' });
}

export function triggerPlatformSync(platform: string): Promise<any> {
  const platformMap: Record<string, string> = {
    meta: '/sync/facebook',
    tiktok: '/sync/tiktok',
    newsbreak: '/sync/newsbreak',
  };
  const endpoint = platformMap[platform];
  if (!endpoint) return Promise.resolve({ skipped: true });
  return request(endpoint, { method: 'POST' });
}

export function triggerFullSync(): Promise<{ success: boolean; message: string }> {
  return request('/sync/all', { method: 'POST' });
}

export function getExportUrl(): string {
  const token = getAuthToken();
  return `${BASE_URL}/export/csv${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

// Settings API
export function fetchSettings(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/settings');
}

export function updateSettings(data: Record<string, string>): Promise<Record<string, string>> {
  return request<Record<string, string>>('/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteSetting(key: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/settings/${key}`, { method: 'DELETE' });
}

export function testFacebookConnection(): Promise<{ success: boolean; error?: string; account_name?: string }> {
  return request('/settings/test/facebook', { method: 'POST' });
}

export function testCCConnection(): Promise<{ success: boolean; error?: string; message?: string }> {
  return request('/settings/test/checkout-champ', { method: 'POST' });
}

export function testNewsBreakConnection(): Promise<{ success: boolean; error?: string; message?: string }> {
  return request('/settings/test/newsbreak', { method: 'POST' });
}

// --- Analytics API ---
export function fetchTimeseries(period?: string, startDate?: string, endDate?: string): Promise<TimeseriesPoint[]> {
  const params = new URLSearchParams();
  if (startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  } else if (period) {
    params.set('period', period);
  }
  const af = getAccountFilterParams();
  af.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const qs = params.toString();
  return request<TimeseriesPoint[]>(`/analytics/timeseries${qs ? `?${qs}` : ''}`);
}

export function fetchBreakdown(by?: string): Promise<BreakdownItem[]> {
  const params = new URLSearchParams();
  if (by) params.set('by', by);
  const af = getAccountFilterParams();
  af.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const qs = params.toString();
  return request<BreakdownItem[]>(`/analytics/breakdown${qs ? `?${qs}` : ''}`);
}

export function fetchFunnel(): Promise<FunnelData> {
  const af = getAccountFilterParams();
  const qs = af.toString();
  return request<FunnelData>(`/analytics/funnel${qs ? `?${qs}` : ''}`);
}

// --- Costs API ---
export function fetchCosts(): Promise<CostSetting[]> {
  return request<CostSetting[]>('/costs');
}

export function saveCost(data: Partial<CostSetting>): Promise<CostSetting> {
  return request<CostSetting>('/costs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteCost(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/costs/${id}`, { method: 'DELETE' });
}

// --- Notifications API ---
export function fetchNotifications(): Promise<AppNotification[]> {
  return request<AppNotification[]>('/notifications');
}

export function fetchNotificationPreferences(): Promise<NotificationPref[]> {
  return request<NotificationPref[]>('/notifications/preferences');
}

export function saveNotificationPreferences(prefs: NotificationPref[]): Promise<void> {
  return request<void>('/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify({ preferences: prefs }),
  });
}

export function markNotificationRead(id: number): Promise<void> {
  return request<void>(`/notifications/${id}/read`, { method: 'POST' });
}

export function fetchUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>('/notifications/unread-count');
}

// --- Operator AI API ---
export function fetchConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/operator/conversations');
}

export function fetchConversation(id: number): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/operator/conversations/${id}`);
}

export function createConversation(title?: string): Promise<Conversation> {
  return request<Conversation>('/operator/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: number): Promise<void> {
  return request<void>(`/operator/conversations/${id}`, { method: 'DELETE' });
}

// --- Rules API ---
export function fetchRules(): Promise<Rule[]> {
  return request<Rule[]>('/rules');
}

export function createRule(data: Partial<Rule>): Promise<Rule> {
  return request<Rule>('/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateRule(id: number, data: Partial<Rule>): Promise<Rule> {
  return request<Rule>(`/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteRule(id: number): Promise<void> {
  return request<void>(`/rules/${id}`, { method: 'DELETE' });
}

export function toggleRule(id: number): Promise<Rule> {
  return request<Rule>(`/rules/${id}/toggle`, { method: 'POST' });
}

export function fetchRuleLogs(id: number): Promise<RuleLog[]> {
  return request<RuleLog[]>(`/rules/${id}/logs`);
}

// --- SQL Builder API ---
export function executeSql(sql: string): Promise<SqlResult> {
  return request<SqlResult>('/sql/execute', {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
}

export function fetchSavedQueries(): Promise<SavedQuery[]> {
  return request<SavedQuery[]>('/sql/saved');
}

export function saveQuery(name: string, sql: string): Promise<SavedQuery> {
  return request<SavedQuery>('/sql/saved', {
    method: 'POST',
    body: JSON.stringify({ name, sql_text: sql }),
  });
}

export function deleteSavedQuery(id: number): Promise<void> {
  return request<void>(`/sql/saved/${id}`, { method: 'DELETE' });
}

export function fetchSqlSchema(): Promise<SchemaInfo[]> {
  return request<SchemaInfo[]>('/sql/schema');
}

// --- API Keys API ---
export function fetchApiKeys(): Promise<ApiKey[]> {
  return request<ApiKey[]>('/keys');
}

export function generateApiKey(name: string): Promise<{ key: string; id: number; prefix: string }> {
  return request<{ key: string; id: number; prefix: string }>('/keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function revokeApiKey(id: number): Promise<void> {
  return request<void>(`/keys/${id}`, { method: 'DELETE' });
}

// --- Upload API ---
export function uploadCsv(
  type: string,
  headers: string[],
  rows: string[][],
): Promise<UploadResult> {
  return request<UploadResult>('/upload/csv', {
    method: 'POST',
    body: JSON.stringify({ type, headers, rows }),
  });
}

export function fetchUploadTemplates(): Promise<Record<string, { columns?: string[]; required?: string[]; optional?: string[]; description?: string }>> {
  return request<Record<string, { columns?: string[]; required?: string[]; optional?: string[]; description?: string }>>('/upload/templates');
}

// --- Webhook Tokens API ---
export function fetchWebhookTokens(): Promise<WebhookToken[]> {
  return request<WebhookToken[]>('/webhook-tokens');
}

export function createWebhookToken(source: string, label?: string): Promise<WebhookToken> {
  return request<WebhookToken>('/webhook-tokens', {
    method: 'POST',
    body: JSON.stringify({ source, label }),
  });
}

export function revokeWebhookToken(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/webhook-tokens/${id}`, { method: 'DELETE' });
}

// --- Pixel Configs API ---
export function fetchPixelConfigs(): Promise<PixelConfig[]> {
  return request<PixelConfig[]>('/pixel-configs');
}

export function savePixelConfig(data: Partial<PixelConfig>): Promise<PixelConfig> {
  return request<PixelConfig>('/pixel-configs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deletePixelConfig(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/pixel-configs/${id}`, { method: 'DELETE' });
}

export function fetchPixelSnippet(funnelPage: string): Promise<{ snippet: string }> {
  return request<{ snippet: string }>(`/pixel-configs/snippet/${encodeURIComponent(funnelPage)}`);
}

// --- Source/Medium API ---
export function fetchSourceMedium(dateRange?: string): Promise<SourceMediumRow[]> {
  const params = new URLSearchParams();
  if (dateRange) params.set('dateRange', dateRange);
  const af = getAccountFilterParams();
  af.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const qs = params.toString();
  return request<SourceMediumRow[]>(`/analytics/source-medium${qs ? `?${qs}` : ''}`);
}

// --- P&L API ---
export function fetchPnL(): Promise<PnLData> {
  const af = getAccountFilterParams();
  const qs = af.toString();
  return request<PnLData>(`/analytics/pnl${qs ? `?${qs}` : ''}`);
}

// --- Creative Analytics API ---
export interface CreativeItem {
  id: number;
  ad_id: string;
  ad_name: string;
  platform: string;
  creative_type: string;
  thumbnail_url: string;
  image_url: string;
  headline: string;
  ad_copy: string;
  campaign_name: string;
  adset_name: string;
  status: string;
  first_seen: string;
  last_seen: string;
  // Tags
  asset_type: string;
  visual_format: string;
  hook_type: string;
  creative_angle: string;
  messaging_theme: string;
  talent_type: string;
  offer_type: string;
  cta_style: string;
  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
  cvr: number;
  // Launch analysis
  momentum?: string;
}

export interface ComparativeRow {
  dimension_value: string;
  creative_count: number;
  total_spend: number;
  total_revenue: number;
  avg_roas: number;
  avg_cpa: number;
  avg_ctr: number;
  avg_cvr: number;
}

export interface SavedCreative {
  id: number;
  platform: string;
  brand_name: string;
  ad_id: string;
  thumbnail_url: string;
  video_url: string;
  ad_copy: string;
  headline: string;
  notes: string;
  tags: string[];
  saved_at: string;
}

export interface Board {
  id: number;
  name: string;
  description: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface FollowedBrand {
  id: number;
  brand_name: string;
  platform: string;
  platform_page_id: string;
  followed_at: string;
}

export interface Snapshot {
  id: number;
  snapshot_token: string;
  title: string;
  report_type: string;
  is_live: boolean;
  expires_at: string;
  created_at: string;
  url?: string;
}

export function fetchCreatives(params: Record<string, string> = {}): Promise<{ data: CreativeItem[]; page: number; limit: number }> {
  const qs = new URLSearchParams(params).toString();
  return request(`/creatives${qs ? `?${qs}` : ''}`);
}

export function fetchCreativeDetail(id: number): Promise<CreativeItem & { daily_metrics: any[] }> {
  return request(`/creatives/${id}`);
}

export function fetchTopPerforming(params: Record<string, string> = {}): Promise<CreativeItem[]> {
  const qs = new URLSearchParams(params).toString();
  return request(`/creatives/top-performing${qs ? `?${qs}` : ''}`);
}

export function fetchComparative(params: Record<string, string> = {}): Promise<ComparativeRow[]> {
  const qs = new URLSearchParams(params).toString();
  return request(`/creatives/comparative${qs ? `?${qs}` : ''}`);
}

export function fetchLaunchAnalysis(params: Record<string, string> = {}): Promise<CreativeItem[]> {
  const qs = new URLSearchParams(params).toString();
  return request(`/creatives/launch-analysis${qs ? `?${qs}` : ''}`);
}

export function fetchCreativeDiversity(): Promise<Record<string, Record<string, number>>> {
  return request('/creatives/diversity');
}

export function fetchTagDistribution(): Promise<Record<string, any[]>> {
  return request('/creatives/tags/distribution');
}

export function triggerCreativeTagging(): Promise<{ tagged: number; skipped: number }> {
  return request('/creatives/tag', { method: 'POST' });
}

// Inspo
export function fetchInspoFeed(page = 1): Promise<{ data: SavedCreative[] }> {
  return request(`/creatives/inspo/feed?page=${page}`);
}

export function saveInspoCreative(data: Partial<SavedCreative>): Promise<SavedCreative> {
  return request('/creatives/inspo/save', { method: 'POST', body: JSON.stringify(data) });
}

export function fetchSavedCreatives(params: Record<string, string> = {}): Promise<{ data: SavedCreative[] }> {
  const qs = new URLSearchParams(params).toString();
  return request(`/creatives/inspo/saved${qs ? `?${qs}` : ''}`);
}

export function deleteSavedCreative(id: number): Promise<{ success: boolean }> {
  return request(`/creatives/inspo/saved/${id}`, { method: 'DELETE' });
}

export function fetchFollowedBrands(): Promise<FollowedBrand[]> {
  return request('/creatives/inspo/brands');
}

export function followBrand(data: { brand_name: string; platform?: string; platform_page_id?: string }): Promise<FollowedBrand> {
  return request('/creatives/inspo/brands', { method: 'POST', body: JSON.stringify(data) });
}

export function unfollowBrand(id: number): Promise<{ success: boolean }> {
  return request(`/creatives/inspo/brands/${id}`, { method: 'DELETE' });
}

// Webhook Keys
export interface WebhookApiKey {
  id: number;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
}

export function fetchWebhookApiKeys(): Promise<WebhookApiKey[]> {
  return request<WebhookApiKey[]>('/creatives/webhook/keys');
}

export function generateWebhookApiKey(name: string): Promise<WebhookApiKey & { key: string }> {
  return request<WebhookApiKey & { key: string }>('/creatives/webhook/keys', { method: 'POST', body: JSON.stringify({ name }) });
}

export function revokeWebhookApiKey(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/creatives/webhook/keys/${id}`, { method: 'DELETE' });
}

// Boards
export function fetchBoards(): Promise<Board[]> {
  return request('/creatives/boards');
}

export function createBoard(data: { name: string; description?: string }): Promise<Board> {
  return request('/creatives/boards', { method: 'POST', body: JSON.stringify(data) });
}

export function updateBoard(id: number, data: { name?: string; description?: string }): Promise<Board> {
  return request(`/creatives/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteBoard(id: number): Promise<{ success: boolean }> {
  return request(`/creatives/boards/${id}`, { method: 'DELETE' });
}

export function addBoardItem(boardId: number, savedCreativeId: number): Promise<any> {
  return request(`/creatives/boards/${boardId}/items`, { method: 'POST', body: JSON.stringify({ saved_creative_id: savedCreativeId }) });
}

export function removeBoardItem(boardId: number, itemId: number): Promise<{ success: boolean }> {
  return request(`/creatives/boards/${boardId}/items/${itemId}`, { method: 'DELETE' });
}

// Snapshots
export function createSnapshot(data: { title: string; report_type: string; report_config: any; is_live?: boolean; expires_in_hours?: number }): Promise<Snapshot> {
  return request('/creatives/snapshots', { method: 'POST', body: JSON.stringify(data) });
}

export function fetchSnapshots(): Promise<Snapshot[]> {
  return request('/creatives/snapshots');
}

export function deleteSnapshot(id: number): Promise<{ success: boolean }> {
  return request(`/creatives/snapshots/${id}`, { method: 'DELETE' });
}

// --- Accounts & Offers API ---
export function fetchAccounts(): Promise<Account[]> {
  return request<Account[]>('/accounts');
}

export function createAccount(data: Partial<Account>): Promise<Account> {
  return request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  return request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAccount(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/accounts/${id}`, { method: 'DELETE' });
}

export function testAccountConnection(id: number): Promise<{ success: boolean; error?: string; message?: string }> {
  return request(`/accounts/${id}/test`, { method: 'POST' });
}

export function fetchAccountSummary(): Promise<AccountSummary[]> {
  return request<AccountSummary[]>('/accounts/summary');
}

export function fetchOffers(): Promise<Offer[]> {
  return request<Offer[]>('/accounts/offers');
}

export function createOffer(data: Partial<Offer>): Promise<Offer> {
  return request<Offer>('/accounts/offers', { method: 'POST', body: JSON.stringify(data) });
}

export function updateOffer(id: number, data: Partial<Offer>): Promise<Offer> {
  return request<Offer>(`/accounts/offers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteOffer(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/accounts/offers/${id}`, { method: 'DELETE' });
}

// --- Brand Configs API ---
export interface BrandConfig {
  id: number;
  name: string;
  brand_name: string;
  logo_url: string;
  brand_colors: string;
  tone_of_voice: string;
  target_audience: string;
  usp: string;
  guidelines: string;
  is_default: boolean;
  client_id: number | null;
  created_at: string;
  updated_at: string;
}

export function fetchBrandConfigs(): Promise<BrandConfig[]> {
  return request<BrandConfig[]>('/brand-configs');
}

export function createBrandConfig(data: Partial<BrandConfig>): Promise<BrandConfig> {
  return request<BrandConfig>('/brand-configs', { method: 'POST', body: JSON.stringify(data) });
}

export function updateBrandConfig(id: number, data: Partial<BrandConfig>): Promise<BrandConfig> {
  return request<BrandConfig>(`/brand-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteBrandConfig(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/brand-configs/${id}`, { method: 'DELETE' });
}

export function setDefaultBrandConfig(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/brand-configs/${id}/set-default`, { method: 'POST' });
}

// --- Client types & API ---
export interface Client {
  id: number;
  name: string;
  logo_url: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export function fetchClients(): Promise<Client[]> {
  return request<Client[]>('/clients');
}

export function createClient(data: Partial<Client>): Promise<Client> {
  return request<Client>('/clients', { method: 'POST', body: JSON.stringify(data) });
}

export function updateClient(id: number, data: Partial<Client>): Promise<Client> {
  return request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteClient(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' });
}

// --- Campaign Builder types ---
export interface CampaignDraft {
  id: number;
  user_id: number;
  account_id: number | null;
  name: string;
  objective: string;
  status: 'draft' | 'validating' | 'publishing' | 'published' | 'failed' | 'archived';
  special_ad_categories: string[];
  config: Record<string, any>;
  meta_campaign_id: string | null;
  tiktok_campaign_id: string | null;
  newsbreak_campaign_id: string | null;
  last_error: string | null;
  account_name?: string;
  platform: string;
  platform_account_id?: string;
  adsets?: CampaignAdSet[];
  created_at: string;
  updated_at: string;
}

export interface CampaignAdSet {
  id: number;
  draft_id: number;
  name: string;
  targeting: Record<string, any>;
  budget_type: 'daily' | 'lifetime';
  budget_cents: number;
  bid_strategy: string;
  schedule_start: string | null;
  schedule_end: string | null;
  status: string;
  meta_adset_id: string | null;
  last_error: string | null;
  ads?: CampaignAd[];
  created_at: string;
  updated_at: string;
}

export interface CampaignAd {
  id: number;
  adset_id: number;
  name: string;
  creative_config: Record<string, any>;
  generated_creative_id: number | null;
  media_upload_id: number | null;
  library_creative_id: number | null;
  status: string;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  tiktok_ad_id: string | null;
  newsbreak_ad_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignTemplate {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  objective: string | null;
  targeting: Record<string, any>;
  budget_config: Record<string, any>;
  creative_config: Record<string, any>;
  config: Record<string, any>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaUpload {
  id: number;
  user_id: number;
  account_id: number | null;
  filename: string;
  mime_type: string;
  file_size: number;
  file_path: string;
  meta_image_hash: string | null;
  status: string;
  created_at: string;
}

export interface PublishResult {
  success: boolean;
  meta_campaign_id?: string;
  tiktok_campaign_id?: string;
  newsbreak_campaign_id?: string;
  adsets: { local_id: number; meta_id?: string; tiktok_id?: string; newsbreak_id?: string; error?: string }[];
  ads: { local_id: number; meta_id?: string; tiktok_id?: string; newsbreak_id?: string; error?: string }[];
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// --- Campaign Builder API ---
export function fetchCampaignDrafts(): Promise<CampaignDraft[]> {
  return request<CampaignDraft[]>('/campaigns/drafts');
}

export function fetchCampaignDraft(id: number): Promise<CampaignDraft> {
  return request<CampaignDraft>(`/campaigns/drafts/${id}`);
}

export function createCampaignDraft(data: { account_id: number; name: string; objective?: string; special_ad_categories?: string[]; platform?: string }): Promise<CampaignDraft> {
  return request<CampaignDraft>('/campaigns/drafts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCampaignDraft(id: number, data: Partial<CampaignDraft>): Promise<CampaignDraft> {
  return request<CampaignDraft>(`/campaigns/drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteCampaignDraft(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/drafts/${id}`, { method: 'DELETE' });
}

export function publishCampaignDraft(id: number): Promise<PublishResult> {
  return request<PublishResult>(`/campaigns/drafts/${id}/publish`, { method: 'POST' });
}

export function activateCampaign(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/drafts/${id}/activate`, { method: 'POST' });
}

export function validateCampaignDraft(id: number): Promise<ValidationResult> {
  return request<ValidationResult>(`/campaigns/drafts/${id}/validate`);
}

// Ad Set API
export function createCampaignAdSet(draftId: number, data: Partial<CampaignAdSet>): Promise<CampaignAdSet> {
  return request<CampaignAdSet>(`/campaigns/drafts/${draftId}/adsets`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateCampaignAdSet(id: number, data: Partial<CampaignAdSet>): Promise<CampaignAdSet> {
  return request<CampaignAdSet>(`/campaigns/adsets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteCampaignAdSet(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/adsets/${id}`, { method: 'DELETE' });
}

// Ad API
export function createCampaignAd(adsetId: number, data: Partial<CampaignAd>): Promise<CampaignAd> {
  return request<CampaignAd>(`/campaigns/adsets/${adsetId}/ads`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateCampaignAd(id: number, data: Partial<CampaignAd>): Promise<CampaignAd> {
  return request<CampaignAd>(`/campaigns/ads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteCampaignAd(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/ads/${id}`, { method: 'DELETE' });
}

// Media Upload
export async function uploadCampaignMedia(file: File, accountId?: number): Promise<MediaUpload> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  if (accountId) formData.append('account_id', String(accountId));

  const res = await fetch(`${BASE_URL}/campaigns/media/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// Targeting helpers
export function searchTargetingInterests(q: string): Promise<any[]> {
  return request<any[]>(`/campaigns/targeting/interests?q=${encodeURIComponent(q)}`);
}

export function fetchCustomAudiences(accountId: number): Promise<any[]> {
  return request<any[]>(`/campaigns/targeting/audiences?account_id=${accountId}`);
}

export function fetchAccountPages(accountId: number): Promise<any[]> {
  return request<any[]>(`/campaigns/account-pages?account_id=${accountId}`);
}

// NewsBreak Audiences
export interface NewsBreakAudience {
  audience_id: string;
  audience_name: string;
  audience_type: string;
  status: string;
  size?: number;
  source_audience_id?: string;
  created_at?: string;
}

export function fetchNewsBreakAudiences(accountId?: string): Promise<NewsBreakAudience[]> {
  const qs = accountId ? `?account_id=${accountId}` : '';
  return request<NewsBreakAudience[]>(`/campaigns/newsbreak/audiences${qs}`);
}

export function createNBCustomAudience(audienceName: string, description?: string, accountId?: string): Promise<{ audience_id: string }> {
  return request<{ audience_id: string }>('/campaigns/newsbreak/audiences', {
    method: 'POST',
    body: JSON.stringify({ audience_name: audienceName, description, account_id: accountId }),
  });
}

export function uploadNBAudienceData(audienceId: string, idType: 'EMAIL' | 'PHONE' | 'DEVICE_ID', idList: string[], accountId?: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/newsbreak/audiences/${audienceId}/upload`, {
    method: 'POST',
    body: JSON.stringify({ id_type: idType, id_list: idList, account_id: accountId }),
  });
}

export function createNBLookalikeAudience(sourceAudienceId: string, audienceName: string, lookalikeRatio?: number, accountId?: string): Promise<{ audience_id: string }> {
  return request<{ audience_id: string }>('/campaigns/newsbreak/audiences/lookalike', {
    method: 'POST',
    body: JSON.stringify({ source_audience_id: sourceAudienceId, audience_name: audienceName, lookalike_ratio: lookalikeRatio, account_id: accountId }),
  });
}

export function deleteNBAudience(audienceId: string, accountId?: string): Promise<{ success: boolean }> {
  const qs = accountId ? `?account_id=${accountId}` : '';
  return request<{ success: boolean }>(`/campaigns/newsbreak/audiences/${audienceId}${qs}`, { method: 'DELETE' });
}

// Campaign Templates
export function fetchCampaignTemplates(): Promise<CampaignTemplate[]> {
  return request<CampaignTemplate[]>('/campaigns/templates');
}

export function createCampaignTemplate(data: Partial<CampaignTemplate>): Promise<CampaignTemplate> {
  return request<CampaignTemplate>('/campaigns/templates', { method: 'POST', body: JSON.stringify(data) });
}

export function useCampaignTemplate(id: number, accountId?: number): Promise<CampaignDraft> {
  return request<CampaignDraft>(`/campaigns/templates/${id}/use`, { method: 'POST', body: JSON.stringify({ account_id: accountId }) });
}

export function updateCampaignTemplate(id: number, data: Partial<CampaignTemplate>): Promise<CampaignTemplate> {
  return request<CampaignTemplate>(`/campaigns/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteCampaignTemplate(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/campaigns/templates/${id}`, { method: 'DELETE' });
}

// --- Live Campaigns ---
export interface LiveCampaign {
  platform: 'meta' | 'tiktok' | 'newsbreak';
  campaign_id: string;
  campaign_name: string;
  account_name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  cpa: number;
  adset_count: number;
  ad_count: number;
  status: 'ACTIVE' | 'PAUSED' | 'UNKNOWN';
  daily_budget: number | null;
}

export interface LiveAdset {
  adset_id: string;
  adset_name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
  ad_count: number;
}

export interface LiveAd {
  ad_id: string | null;
  ad_name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
}

export function fetchLiveCampaigns(platform?: string, startDate?: string, endDate?: string, accountId?: number | string): Promise<LiveCampaign[]> {
  const params = new URLSearchParams();
  if (platform && platform !== 'all') params.set('platform', platform);
  if (startDate && endDate) { params.set('startDate', startDate); params.set('endDate', endDate); }
  if (accountId && accountId !== 'all') params.set('account_id', String(accountId));
  const qs = params.toString();
  return request<LiveCampaign[]>(`/campaigns/live${qs ? `?${qs}` : ''}`);
}

export function fetchLiveAdsets(platform: string, campaignId: string, startDate?: string, endDate?: string): Promise<LiveAdset[]> {
  const params = new URLSearchParams();
  if (startDate && endDate) { params.set('startDate', startDate); params.set('endDate', endDate); }
  const qs = params.toString();
  return request<LiveAdset[]>(`/campaigns/live/${platform}/${encodeURIComponent(campaignId)}/adsets${qs ? `?${qs}` : ''}`);
}

export function fetchLiveAds(platform: string, adsetId: string, startDate?: string, endDate?: string): Promise<LiveAd[]> {
  const params = new URLSearchParams();
  if (startDate && endDate) { params.set('startDate', startDate); params.set('endDate', endDate); }
  const qs = params.toString();
  return request<LiveAd[]>(`/campaigns/live/${platform}/${encodeURIComponent(adsetId)}/ads${qs ? `?${qs}` : ''}`);
}

export function updateLiveEntityStatus(platform: string, entityType: string, entityId: string, status: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/campaigns/live/status', { method: 'POST', body: JSON.stringify({ platform, entity_type: entityType, entity_id: entityId, status }) });
}

export function updateLiveEntityBudget(platform: string, entityId: string, budgetDollars: number, oldBudget?: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/campaigns/live/budget', { method: 'POST', body: JSON.stringify({ platform, entity_id: entityId, budget_dollars: budgetDollars, old_budget: oldBudget ?? null }) });
}

export function updateLiveEntityBidCap(platform: string, entityId: string, bidDollars: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/campaigns/live/bid', { method: 'POST', body: JSON.stringify({ platform, entity_id: entityId, bid_dollars: bidDollars }) });
}

export interface ActivityLogEntry {
  id: number;
  platform: string;
  entity_id: string;
  entity_type: string;
  action: 'budget_change' | 'pause' | 'resume';
  old_budget: number | null;
  new_budget: number | null;
  created_at: string;
}

export function fetchActivityLog(entityId: string): Promise<ActivityLogEntry[]> {
  return request<ActivityLogEntry[]>(`/campaigns/live/activity-log/${encodeURIComponent(entityId)}`);
}

export interface AdGroupBudget {
  adgroup_id: string;
  budget: number;
  budget_mode: string;
  status: string;
  bid_rate?: number;
  bid_type?: string;
}

export function fetchAdGroupBudgets(platform: string, campaignId: string): Promise<AdGroupBudget[]> {
  return request<AdGroupBudget[]>(`/campaigns/live/budgets/${platform}/${encodeURIComponent(campaignId)}`);
}

// ── Campaign→Account Mapping ─────────────────────────────────

export interface CampaignAccountMap {
  campaign_id: string;
  account_id: number;
  account_name: string;
}

export function fetchCampaignAccountMap(): Promise<CampaignAccountMap[]> {
  return request<CampaignAccountMap[]>('/campaigns/account-map');
}

export function assignCampaignAccount(campaignId: string, accountId: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/campaigns/assign-account', { method: 'POST', body: JSON.stringify({ campaign_id: campaignId, account_id: accountId }) });
}

export function bulkAssignCampaignAccount(campaignIds: string[], accountId: number): Promise<{ success: boolean; assigned: number }> {
  return request<{ success: boolean; assigned: number }>('/campaigns/assign-account/bulk', { method: 'POST', body: JSON.stringify({ campaign_ids: campaignIds, account_id: accountId }) });
}

export interface QuickCreateParams {
  account_id?: number;
  platform: string;
  campaign_name: string;
  objective?: string;
  daily_budget?: number;
  budget_type?: 'daily' | 'lifetime';
  adset_name?: string;
  ad_name?: string;
  headline?: string;
  ad_text: string;
  image_url?: string;
  video_url?: string;
  landing_page_url?: string;
  call_to_action?: string;
  // Targeting & optimization
  targeting?: Record<string, any>;
  placements?: string[];
  optimization_goal?: string;
  bid_type?: string;
  bid_amount?: number;
  event_type?: string;
  // Extra creative fields
  brand_name?: string;
  button_text?: string;
  thumbnail_url?: string;
}

export function quickCreateCampaign(params: QuickCreateParams): Promise<PublishResult & { draft_id: number }> {
  return request('/campaigns/quick-create', { method: 'POST', body: JSON.stringify(params) });
}

export interface BatchCreateParams {
  format: string;
  platform: string;
  account_id?: number;
  campaign_name: string;
  objective?: string;
  adset_config?: {
    daily_budget?: number;
    budget_type?: string;
    bid_type?: string;
    bid_amount?: number;
    optimization_goal?: string;
    targeting?: Record<string, any>;
    placements?: string[];
    event_type?: string;
    schedule_start?: string;
    schedule_end?: string;
  };
  creative_config?: Record<string, any>;
  media_ids?: number[];
  auto_publish?: boolean;
}

export function batchCreateCampaign(params: BatchCreateParams): Promise<{ success: boolean; results: any[] }> {
  return request('/campaigns/batch-create', { method: 'POST', body: JSON.stringify(params) });
}

export function duplicateLiveEntity(entityType: string, entityId: number | string, targetParentId?: number | string, platform?: string): Promise<{ success: boolean; new_id: number | string }> {
  return request('/campaigns/duplicate', { method: 'POST', body: JSON.stringify({ entity_type: entityType, entity_id: entityId, target_parent_id: targetParentId, platform }) });
}

// --- Creative Templates types (Phase 2) ---
export interface CreativeTemplate {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  structure: Record<string, any>;
  variable_slots: Record<string, any>[];
  source_creative_id: number | null;
  platform: string;
  creative_type: string;
  tags: string[];
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface GenerationJob {
  id: number;
  user_id: number;
  job_type: string;
  status: string;
  input_params: Record<string, any>;
  output: Record<string, any> | null;
  model_used: string | null;
  tokens_used: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

// --- Creative Templates API (Phase 2) ---
export function fetchCreativeTemplates(): Promise<CreativeTemplate[]> {
  return request<CreativeTemplate[]>('/templates');
}

export function createCreativeTemplate(data: Partial<CreativeTemplate>): Promise<CreativeTemplate> {
  return request<CreativeTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCreativeTemplate(id: number, data: Partial<CreativeTemplate>): Promise<CreativeTemplate> {
  return request<CreativeTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteCreativeTemplate(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' });
}

export function duplicateCreativeTemplate(id: number): Promise<CreativeTemplate> {
  return request<CreativeTemplate>(`/templates/${id}/duplicate`, { method: 'POST' });
}

// --- AI Creative Generation API (Phase 2) ---
export function generateAdCopy(params: {
  creative_type: string;
  platform: string;
  brief: string;
  brand_config_id?: number;
  template_id?: number;
  inspiration_ad_id?: number;
  account_id?: number;
  variation_count?: number;
}): Promise<any> {
  return request('/creative-gen/generate', { method: 'POST', body: JSON.stringify(params) });
}

export function generateAdCopyStream(params: any): { url: string; body: string } {
  return {
    url: `${BASE_URL}/creative-gen/generate/stream`,
    body: JSON.stringify(params),
  };
}

export function generateVariations(creativeId: number, count?: number): Promise<any> {
  return request(`/creative-gen/variations`, { method: 'POST', body: JSON.stringify({ creative_id: creativeId, count }) });
}

export function generateABTestSuggestions(creativeId: number): Promise<any> {
  return request(`/creative-gen/ab-test`, { method: 'POST', body: JSON.stringify({ creative_id: creativeId }) });
}

export function extractCreativeTemplate(creativeId: number): Promise<CreativeTemplate> {
  return request<CreativeTemplate>(`/creative-gen/extract-template`, { method: 'POST', body: JSON.stringify({ creative_id: creativeId }) });
}

// --- Ad Library API (Phase 3) ---
export interface AdLibraryResult {
  id: number;
  platform: string;
  meta_ad_id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies: string[];
  ad_creative_link_titles: string[];
  ad_creative_link_descriptions: string[];
  ad_snapshot_url: string | null;
  impressions_lower: number | null;
  impressions_upper: number | null;
  spend_lower: number | null;
  spend_upper: number | null;
  currency: string | null;
  ad_delivery_start: string | null;
  ad_delivery_stop: string | null;
  publisher_platforms: string[];
  created_at: string;
}

export interface AdLibrarySearchParams {
  platform?: 'meta' | 'tiktok';
  search_terms?: string;
  page_id?: string;
  country: string;
  ad_active_status?: string;
  ad_type?: string;
  limit?: number;
  after?: string;
}

export interface AdLibraryTrend {
  id: number;
  page_id: string;
  page_name: string;
  date: string;
  active_ad_count: number;
  new_ads: number;
  stopped_ads: number;
  themes: string[];
}

export function fetchFeaturedAds(): Promise<AdLibraryResult[]> {
  return request<AdLibraryResult[]>('/ad-library/featured');
}

export function searchAdLibrary(params: AdLibrarySearchParams): Promise<{ data: AdLibraryResult[]; paging?: { after?: string } }> {
  return request('/ad-library/search', { method: 'POST', body: JSON.stringify(params) });
}

export function fetchAdLibraryResults(params?: { page_id?: string; search?: string }): Promise<AdLibraryResult[]> {
  const qs = new URLSearchParams();
  if (params?.page_id) qs.set('page_id', params.page_id);
  if (params?.search) qs.set('search', params.search);
  const q = qs.toString();
  return request<AdLibraryResult[]>(`/ad-library/results${q ? `?${q}` : ''}`);
}

export function fetchAdLibraryResult(id: number): Promise<AdLibraryResult> {
  return request<AdLibraryResult>(`/ad-library/results/${id}`);
}

export function saveAdToInspo(adLibraryId: number): Promise<{ success: boolean }> {
  return request('/ad-library/save-to-inspo', { method: 'POST', body: JSON.stringify({ ad_library_id: adLibraryId }) });
}

export function extractTemplateFromAd(adLibraryId: number): Promise<CreativeTemplate> {
  return request<CreativeTemplate>('/ad-library/extract-template', { method: 'POST', body: JSON.stringify({ ad_library_id: adLibraryId }) });
}

export function fetchAdLibraryRateStatus(): Promise<{ calls_used: number; limit: number; reset_at: string }> {
  return request('/ad-library/rate-status');
}

export function syncAdLibraryBrands(): Promise<{ success: boolean }> {
  return request('/ad-library/sync-brands', { method: 'POST' });
}

export function fetchAdLibraryTrends(pageId: string): Promise<AdLibraryTrend[]> {
  return request<AdLibraryTrend[]>(`/ad-library/trends/${pageId}`);
}

export function computeAdLibraryTrends(pageId: string): Promise<AdLibraryTrend> {
  return request<AdLibraryTrend>(`/ad-library/trends/${pageId}/compute`, { method: 'POST' });
}

export function analyzeCompetitorStrategy(pageId: string): { url: string; body: string } {
  return {
    url: `${BASE_URL}/ad-library/ai/analyze`,
    body: JSON.stringify({ page_id: pageId }),
  };
}
