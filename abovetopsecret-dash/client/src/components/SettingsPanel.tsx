import { useState, useEffect, useCallback } from 'react';
import {
  OverrideRow, fetchOverrides, createOverride, deleteOverride as deleteOverrideApi,
  fetchSettings, updateSettings, testFacebookConnection, testCCConnection,
} from '../lib/api';

type Tab = 'connections' | 'overrides' | 'dashboard';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  offers: string[];
  onSaved: () => void;
}

const METRIC_OPTIONS = [
  'spend', 'revenue', 'roi', 'cpa', 'aov', 'ctr', 'cpm', 'cpc', 'cvr',
  'conversions', 'new_customer_pct', 'take_rate_1', 'take_rate_3', 'take_rate_5',
  'subscription_pct', 'upsell_take_rate', 'upsell_decline_rate',
];

export default function SettingsPanel({ open, onClose, offers, onSaved }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>('connections');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Connection form state
  const [fbToken, setFbToken] = useState('');
  const [fbAccountIds, setFbAccountIds] = useState('');
  const [ccApiKey, setCcApiKey] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  const [ccPollEnabled, setCcPollEnabled] = useState(true);
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');

  // Dashboard settings
  const [authToken, setAuthToken] = useState('');
  const [syncInterval, setSyncInterval] = useState('10');

  // Connection test state
  const [fbTestStatus, setFbTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [fbTestMessage, setFbTestMessage] = useState('');
  const [ccTestStatus, setCcTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ccTestMessage, setCcTestMessage] = useState('');

  // Override state
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [metricKey, setMetricKey] = useState('spend');
  const [offerName, setOfferName] = useState('ALL');
  const [overrideValue, setOverrideValue] = useState('');
  const [setBy, setSetBy] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setFbAccountIds(s.fb_ad_account_ids || '');
      setCcApiUrl(s.cc_api_url || '');
      setCcPollEnabled(s.cc_poll_enabled !== 'false');
      setShopifyStoreUrl(s.shopify_store_url || '');
      setSyncInterval(s.sync_interval_minutes || '10');
    } catch {
      // Settings may not be available yet
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadSettings();
      fetchOverrides().then(setOverrides).catch(() => {});
    }
  }, [open, loadSettings]);

  const handleSaveConnections = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data: Record<string, string> = {};
      if (fbToken) data.fb_access_token = fbToken;
      if (fbAccountIds) data.fb_ad_account_ids = fbAccountIds;
      if (ccApiKey) data.cc_api_key = ccApiKey;
      if (ccApiUrl) data.cc_api_url = ccApiUrl;
      if (ccWebhookSecret) data.cc_webhook_secret = ccWebhookSecret;
      data.cc_poll_enabled = ccPollEnabled ? 'true' : 'false';
      if (shopifySecret) data.shopify_webhook_secret = shopifySecret;
      if (shopifyStoreUrl) data.shopify_store_url = shopifyStoreUrl;

      const updated = await updateSettings(data);
      setSettings(updated);
      setFbToken('');
      setCcApiKey('');
      setCcWebhookSecret('');
      setShopifySecret('');
      setMessage({ type: 'success', text: 'Settings saved' });
      onSaved();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDashboard = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data: Record<string, string> = {};
      if (authToken) data.auth_token = authToken;
      if (syncInterval) data.sync_interval_minutes = syncInterval;

      const updated = await updateSettings(data);
      setSettings(updated);
      setAuthToken('');
      setMessage({ type: 'success', text: 'Dashboard settings saved' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestFB = async () => {
    setFbTestStatus('testing');
    try {
      const result = await testFacebookConnection();
      if (result.success) {
        setFbTestStatus('success');
        setFbTestMessage(result.account_name || 'Connected');
      } else {
        setFbTestStatus('error');
        setFbTestMessage(result.error || 'Connection failed');
      }
    } catch {
      setFbTestStatus('error');
      setFbTestMessage('Connection failed');
    }
  };

  const handleTestCC = async () => {
    setCcTestStatus('testing');
    try {
      const result = await testCCConnection();
      if (result.success) {
        setCcTestStatus('success');
        setCcTestMessage(result.message || 'Connected');
      } else {
        setCcTestStatus('error');
        setCcTestMessage(result.error || 'Connection failed');
      }
    } catch {
      setCcTestStatus('error');
      setCcTestMessage('Connection failed');
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideValue) return;
    setOverrideSaving(true);
    try {
      await createOverride({
        metric_key: metricKey,
        offer_name: offerName,
        override_value: parseFloat(overrideValue),
        set_by: setBy || 'admin',
      });
      const updated = await fetchOverrides();
      setOverrides(updated);
      setOverrideValue('');
      onSaved();
    } catch {
      // error handled silently
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleDeleteOverride = async (id: number) => {
    try {
      await deleteOverrideApi(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      onSaved();
    } catch {
      // error handled silently
    }
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: '#030712',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#f9fafb',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#6b7280',
    display: 'block',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
    padding: 16,
    background: '#0a0f1a',
    borderRadius: 8,
    border: '1px solid #1f2937',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: '#f9fafb',
    marginBottom: 16,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '8px 16px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#9ca3af',
    fontSize: 13,
    cursor: 'pointer',
  };

  const statusDot = (status: 'idle' | 'testing' | 'success' | 'error') => {
    const colors = { idle: '#6b7280', testing: '#f59e0b', success: '#10b981', error: '#ef4444' };
    return (
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[status],
        marginRight: 6,
      }} />
    );
  };

  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 440,
        background: '#111827',
        borderLeft: '1px solid #1f2937',
        zIndex: 50,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 }}>Settings</h2>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer', padding: '10px 14px', minHeight: 44, minWidth: 44 }}
            >
              X
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#030712', borderRadius: 8, padding: 4 }}>
            {(['connections', 'overrides', 'dashboard'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: tab === t ? '#1f2937' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: tab === t ? '#f9fafb' : '#6b7280',
                  fontSize: 12,
                  fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {/* Status message */}
          {message && (
            <div style={{
              padding: '8px 12px',
              marginBottom: 16,
              borderRadius: 6,
              background: message.type === 'success' ? '#064e3b' : '#7f1d1d',
              color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
              fontSize: 13,
            }}>
              {message.text}
            </div>
          )}

          {/* CONNECTIONS TAB */}
          {tab === 'connections' && (
            <>
              {/* Facebook */}
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={sectionTitle}>Facebook Ads</h3>
                  {statusDot(fbTestStatus)}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Access Token</label>
                  <input
                    type="password"
                    value={fbToken}
                    onChange={(e) => setFbToken(e.target.value)}
                    placeholder={settings.fb_access_token || 'Enter FB access token'}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Ad Account IDs</label>
                  <input
                    type="text"
                    value={fbAccountIds}
                    onChange={(e) => setFbAccountIds(e.target.value)}
                    placeholder="act_123456789,act_987654321"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    Comma-separated account IDs (include act_ prefix)
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handleTestFB} style={btnSecondary}>
                    {fbTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {fbTestMessage && (
                    <span style={{ fontSize: 12, color: fbTestStatus === 'success' ? '#10b981' : '#ef4444' }}>
                      {fbTestMessage}
                    </span>
                  )}
                </div>
              </div>

              {/* CheckoutChamp */}
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={sectionTitle}>CheckoutChamp</h3>
                  {statusDot(ccTestStatus)}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={ccApiKey}
                    onChange={(e) => setCcApiKey(e.target.value)}
                    placeholder={settings.cc_api_key || 'Enter CC API key'}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>API Base URL</label>
                  <input
                    type="text"
                    value={ccApiUrl}
                    onChange={(e) => setCcApiUrl(e.target.value)}
                    placeholder={settings.cc_api_url || 'https://api.checkoutchamp.com/v1'}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Webhook Secret</label>
                  <input
                    type="password"
                    value={ccWebhookSecret}
                    onChange={(e) => setCcWebhookSecret(e.target.value)}
                    placeholder={settings.cc_webhook_secret || 'Enter webhook secret'}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Webhook URL</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      readOnly
                      value={`${webhookBaseUrl}/api/webhooks/checkout-champ`}
                      style={{ ...inputStyle, color: '#9ca3af', flex: 1 }}
                    />
                    <button
                      onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/checkout-champ`)}
                      style={{ ...btnSecondary, whiteSpace: 'nowrap' }}
                    >
                      Copy
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    Register this URL in your CheckoutChamp webhook settings
                  </div>
                </div>

                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>API Polling</label>
                  <button
                    onClick={() => setCcPollEnabled(!ccPollEnabled)}
                    style={{
                      padding: '4px 12px',
                      background: ccPollEnabled ? '#065f46' : '#374151',
                      border: 'none',
                      borderRadius: 12,
                      color: ccPollEnabled ? '#6ee7b7' : '#9ca3af',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {ccPollEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handleTestCC} style={btnSecondary}>
                    {ccTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {ccTestMessage && (
                    <span style={{ fontSize: 12, color: ccTestStatus === 'success' ? '#10b981' : '#ef4444' }}>
                      {ccTestMessage}
                    </span>
                  )}
                </div>
              </div>

              {/* Shopify */}
              <div style={sectionStyle}>
                <h3 style={sectionTitle}>Shopify</h3>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Webhook Secret</label>
                  <input
                    type="password"
                    value={shopifySecret}
                    onChange={(e) => setShopifySecret(e.target.value)}
                    placeholder={settings.shopify_webhook_secret || 'Enter Shopify webhook secret'}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Webhook URL</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      readOnly
                      value={`${webhookBaseUrl}/api/webhooks/shopify`}
                      style={{ ...inputStyle, color: '#9ca3af', flex: 1 }}
                    />
                    <button
                      onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/shopify`)}
                      style={{ ...btnSecondary, whiteSpace: 'nowrap' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Store URL (informational)</label>
                  <input
                    type="text"
                    value={shopifyStoreUrl}
                    onChange={(e) => setShopifyStoreUrl(e.target.value)}
                    placeholder={settings.shopify_store_url || 'mystore.myshopify.com'}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button onClick={handleSaveConnections} disabled={saving} style={{ ...btnPrimary, width: '100%' }}>
                {saving ? 'Saving...' : 'Save All Connections'}
              </button>
            </>
          )}

          {/* OVERRIDES TAB */}
          {tab === 'overrides' && (
            <>
              <form onSubmit={handleOverrideSubmit} style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Metric</label>
                  <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} style={selectStyle}>
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Offer</label>
                  <select value={offerName} onChange={(e) => setOfferName(e.target.value)} style={selectStyle}>
                    <option value="ALL">ALL (Global)</option>
                    {offers.filter((o) => o !== 'All').map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Value</label>
                  <input
                    type="number"
                    step="any"
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(e.target.value)}
                    placeholder="Override value"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input
                    type="text"
                    value={setBy}
                    onChange={(e) => setSetBy(e.target.value)}
                    placeholder="admin"
                    style={inputStyle}
                  />
                </div>

                <button
                  type="submit"
                  disabled={overrideSaving || !overrideValue}
                  style={{
                    ...btnPrimary,
                    width: '100%',
                    background: overrideValue ? '#3b82f6' : '#1f2937',
                    cursor: overrideValue ? 'pointer' : 'default',
                  }}
                >
                  {overrideSaving ? 'Saving...' : 'Set Override'}
                </button>
              </form>

              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Active Overrides
              </h3>
              {overrides.length === 0 ? (
                <div style={{ color: '#4b5563', fontSize: 13 }}>No overrides set</div>
              ) : (
                overrides.map((ov) => (
                  <div
                    key={ov.id}
                    style={{
                      background: '#030712',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                      border: '1px solid #1f2937',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb' }}>
                        {ov.metric_key}
                        <span style={{ color: '#6b7280', fontWeight: 400 }}> = </span>
                        <span style={{ color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
                          {ov.override_value}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {ov.offer_name} — by {ov.set_by}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteOverride(ov.id); }}
                      style={{
                        background: '#1f2937',
                        border: 'none',
                        color: '#ef4444',
                        padding: '10px 14px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        minHeight: 44,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {/* DASHBOARD TAB */}
          {tab === 'dashboard' && (
            <>
              <div style={sectionStyle}>
                <h3 style={sectionTitle}>Authentication</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Auth Token</label>
                  <input
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder={settings.auth_token || 'Change dashboard access token'}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    Leave blank to keep current token. Set to change.
                  </div>
                </div>
              </div>

              <div style={sectionStyle}>
                <h3 style={sectionTitle}>Sync Settings</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Facebook Sync Interval (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button onClick={handleSaveDashboard} disabled={saving} style={{ ...btnPrimary, width: '100%' }}>
                {saving ? 'Saving...' : 'Save Dashboard Settings'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
