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

export interface SummaryData {
  total_spend: number;
  total_revenue: number;
  total_roi: number;
  total_conversions: number;
}

export interface OverrideRow {
  id: number;
  metric_key: string;
  offer_name: string;
  override_value: number;
  set_by: string;
  set_at: string;
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
