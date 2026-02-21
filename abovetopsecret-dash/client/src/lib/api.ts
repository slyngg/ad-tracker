import { getAuthToken } from '../stores/authStore';

const BASE_URL = '/api';

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
  enabled: boolean;
  created_at: string;
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
  errors: string[];
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
  const qs = params.toString();
  return request<MetricRow[]>(`/metrics${qs ? `?${qs}` : ''}`);
}

export function fetchSummary(): Promise<SummaryData> {
  return request<SummaryData>('/metrics/summary');
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

// --- Analytics API ---
export function fetchTimeseries(period?: string): Promise<TimeseriesPoint[]> {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  const qs = params.toString();
  return request<TimeseriesPoint[]>(`/analytics/timeseries${qs ? `?${qs}` : ''}`);
}

export function fetchBreakdown(by?: string): Promise<BreakdownItem[]> {
  const params = new URLSearchParams();
  if (by) params.set('by', by);
  const qs = params.toString();
  return request<BreakdownItem[]>(`/analytics/breakdown${qs ? `?${qs}` : ''}`);
}

export function fetchFunnel(): Promise<FunnelData> {
  return request<FunnelData>('/analytics/funnel');
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

export function fetchUploadTemplates(): Promise<Record<string, { required: string[]; optional: string[] }>> {
  return request<Record<string, { required: string[]; optional: string[] }>>('/upload/templates');
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
  const qs = params.toString();
  return request<SourceMediumRow[]>(`/analytics/source-medium${qs ? `?${qs}` : ''}`);
}

// --- P&L API ---
export function fetchPnL(): Promise<PnLData> {
  return request<PnLData>('/analytics/pnl');
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

export function fetchLaunchAnalysis(): Promise<CreativeItem[]> {
  return request('/creatives/launch-analysis');
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
