import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, updateSettings, testFacebookConnection, testCCConnection } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

export default function ConnectionsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [fbToken, setFbToken] = useState('');
  const [fbAccountIds, setFbAccountIds] = useState('');
  const [ccApiKey, setCcApiKey] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  const [ccPollEnabled, setCcPollEnabled] = useState(true);
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');

  const [fbTestStatus, setFbTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [fbTestMessage, setFbTestMessage] = useState('');
  const [ccTestStatus, setCcTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ccTestMessage, setCcTestMessage] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setFbAccountIds(s.fb_ad_account_ids || '');
      setCcApiUrl(s.cc_api_url || '');
      setCcPollEnabled(s.cc_poll_enabled !== 'false');
      setShopifyStoreUrl(s.shopify_store_url || '');
    } catch {
      // Settings may not be available yet
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
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
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
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

  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const statusDot = (status: 'idle' | 'testing' | 'success' | 'error') => {
    const colors = { idle: 'bg-ats-text-muted', testing: 'bg-ats-yellow', success: 'bg-ats-green', error: 'bg-ats-red' };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} mr-1.5`} />;
  };

  const inputCls = "w-full px-4 py-3 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";

  return (
    <PageShell title="Connections" subtitle="Manage data source integrations">
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Facebook */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-ats-text mb-4">Facebook Ads</h3>
          {statusDot(fbTestStatus)}
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Access Token</label>
            <input type="password" value={fbToken} onChange={(e) => setFbToken(e.target.value)}
              placeholder={settings.fb_access_token || 'Enter FB access token'} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Ad Account IDs</label>
            <input type="text" value={fbAccountIds} onChange={(e) => setFbAccountIds(e.target.value)}
              placeholder="act_123456789,act_987654321" className={inputCls} />
            <div className="text-[11px] text-[#4b5563] mt-1">Comma-separated account IDs (include act_ prefix)</div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={handleTestFB} className="px-4 py-2 bg-ats-border border border-[#374151] rounded-md text-ats-text-muted text-sm hover:bg-ats-hover transition-colors">
              {fbTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {fbTestMessage && (
              <span className={`text-xs ${fbTestStatus === 'success' ? 'text-ats-green' : 'text-ats-red'}`}>{fbTestMessage}</span>
            )}
          </div>
        </div>
      </div>

      {/* CheckoutChamp */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-ats-text mb-4">CheckoutChamp</h3>
          {statusDot(ccTestStatus)}
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>API Key</label>
            <input type="password" value={ccApiKey} onChange={(e) => setCcApiKey(e.target.value)}
              placeholder={settings.cc_api_key || 'Enter CC API key'} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>API Base URL</label>
            <input type="text" value={ccApiUrl} onChange={(e) => setCcApiUrl(e.target.value)}
              placeholder={settings.cc_api_url || 'https://api.checkoutchamp.com/v1'} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Webhook Secret</label>
            <input type="password" value={ccWebhookSecret} onChange={(e) => setCcWebhookSecret(e.target.value)}
              placeholder={settings.cc_webhook_secret || 'Enter webhook secret'} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Webhook URL</label>
            <div className="flex gap-2">
              <input type="text" readOnly value={`${webhookBaseUrl}/api/webhooks/checkout-champ`}
                className={`${inputCls} text-ats-text-muted flex-1`} />
              <button onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/checkout-champ`)}
                className="px-4 py-2 bg-ats-border border border-[#374151] rounded-md text-ats-text-muted text-sm whitespace-nowrap hover:bg-ats-hover transition-colors">
                Copy
              </button>
            </div>
            <div className="text-[11px] text-[#4b5563] mt-1">Register this URL in your CheckoutChamp webhook settings</div>
          </div>
          <div className="flex items-center gap-3">
            <label className={`${labelCls} mb-0`}>API Polling</label>
            <button onClick={() => setCcPollEnabled(!ccPollEnabled)}
              className={`px-3 py-1 rounded-full text-xs ${ccPollEnabled ? 'bg-emerald-900/50 text-emerald-300' : 'bg-[#374151] text-ats-text-muted'}`}>
              {ccPollEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={handleTestCC} className="px-4 py-2 bg-ats-border border border-[#374151] rounded-md text-ats-text-muted text-sm hover:bg-ats-hover transition-colors">
              {ccTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {ccTestMessage && (
              <span className={`text-xs ${ccTestStatus === 'success' ? 'text-ats-green' : 'text-ats-red'}`}>{ccTestMessage}</span>
            )}
          </div>
        </div>
      </div>

      {/* Shopify */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-6">
        <h3 className="text-sm font-bold text-ats-text mb-4">Shopify</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Webhook Secret</label>
            <input type="password" value={shopifySecret} onChange={(e) => setShopifySecret(e.target.value)}
              placeholder={settings.shopify_webhook_secret || 'Enter Shopify webhook secret'} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Webhook URL</label>
            <div className="flex gap-2">
              <input type="text" readOnly value={`${webhookBaseUrl}/api/webhooks/shopify`}
                className={`${inputCls} text-ats-text-muted flex-1`} />
              <button onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/shopify`)}
                className="px-4 py-2 bg-ats-border border border-[#374151] rounded-md text-ats-text-muted text-sm whitespace-nowrap hover:bg-ats-hover transition-colors">
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Store URL (informational)</label>
            <input type="text" value={shopifyStoreUrl} onChange={(e) => setShopifyStoreUrl(e.target.value)}
              placeholder={settings.shopify_store_url || 'mystore.myshopify.com'} className={inputCls} />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
        {saving ? 'Saving...' : 'Save All Connections'}
      </button>
    </PageShell>
  );
}
