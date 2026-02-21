import { useState, useEffect, useCallback } from 'react';
import {
  fetchSettings,
  updateSettings,
  testFacebookConnection,
  testCCConnection,
  fetchWebhookTokens,
  createWebhookToken,
  revokeWebhookToken,
  getOAuthStatus,
  disconnectOAuth,
  WebhookToken,
  OAuthStatus,
} from '../../lib/api';
import PageShell from '../../components/shared/PageShell';
import OAuthConnectButton from '../../components/shared/OAuthConnectButton';

type StatusType = 'idle' | 'testing' | 'success' | 'error';

const OAUTH_PLATFORMS = [
  { key: 'meta', label: 'Meta Ads', icon: '🔷', description: 'Facebook & Instagram ad performance, spend, ROAS' },
  { key: 'google', label: 'Google Analytics', icon: '🔴', description: 'GA4 traffic, conversions, site analytics' },
  { key: 'shopify', label: 'Shopify', icon: '🟢', description: 'Orders, products, webhook data' },
  { key: 'tiktok', label: 'TikTok Ads', icon: '🎵', description: 'Campaign performance, spend, conversions' },
  { key: 'klaviyo', label: 'Klaviyo', icon: '💜', description: 'Email lists, profiles, campaign metrics' },
];

export default function ConnectionsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual fields
  const [fbToken, setFbToken] = useState('');
  const [fbAccountIds, setFbAccountIds] = useState('');
  const [ccApiKey, setCcApiKey] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  const [ccPollEnabled, setCcPollEnabled] = useState(true);
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');

  const [fbTestStatus, setFbTestStatus] = useState<StatusType>('idle');
  const [fbTestMessage, setFbTestMessage] = useState('');
  const [ccTestStatus, setCcTestStatus] = useState<StatusType>('idle');
  const [ccTestMessage, setCcTestMessage] = useState('');

  // OAuth status
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [expandedManual, setExpandedManual] = useState<Record<string, boolean>>({});

  // Webhook tokens
  const [tokens, setTokens] = useState<WebhookToken[]>([]);
  const [newTokenSource, setNewTokenSource] = useState('checkout_champ');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);

  const loadOAuthStatus = useCallback(async () => {
    try {
      const statuses = await getOAuthStatus();
      setOauthStatuses(statuses);
    } catch {}
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setFbAccountIds(s.fb_ad_account_ids || '');
      setCcApiUrl(s.cc_api_url || '');
      setCcPollEnabled(s.cc_poll_enabled !== 'false');
      setShopifyStoreUrl(s.shopify_store_url || '');
    } catch {}
  }, []);

  const loadTokens = useCallback(async () => {
    try {
      const t = await fetchWebhookTokens();
      setTokens(t);
    } catch {}
  }, []);

  useEffect(() => {
    loadSettings();
    loadOAuthStatus();
    loadTokens();
  }, [loadSettings, loadOAuthStatus, loadTokens]);

  const getOAuthStatusForPlatform = (platform: string): OAuthStatus | undefined =>
    oauthStatuses.find(s => s.platform === platform);

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

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}? You can reconnect anytime.`)) return;
    try {
      await disconnectOAuth(platform);
      await loadOAuthStatus();
      setMessage({ type: 'success', text: `${platform} disconnected` });
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const handleOAuthSuccess = () => {
    loadOAuthStatus();
    setMessage({ type: 'success', text: 'Connected successfully!' });
  };

  const handleOAuthError = (msg: string) => {
    setMessage({ type: 'error', text: msg });
  };

  const handleCreateToken = async () => {
    setCreatingToken(true);
    try {
      await createWebhookToken(newTokenSource, newTokenLabel || undefined);
      setNewTokenLabel('');
      loadTokens();
      setMessage({ type: 'success', text: 'Webhook token created' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create token' });
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (id: number) => {
    if (!confirm('Revoke this webhook token? Webhooks using this token will stop working.')) return;
    try {
      await revokeWebhookToken(id);
      loadTokens();
      setMessage({ type: 'success', text: 'Token revoked' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to revoke token' });
    }
  };

  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setMessage({ type: 'success', text: 'Copied to clipboard' });
      setTimeout(() => setMessage(null), 2000);
    }).catch(() => {});
  };

  const inputCls = "w-full px-4 py-3 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";

  const statusBadge = (oauthStatus?: OAuthStatus) => {
    if (!oauthStatus || oauthStatus.status === 'disconnected') {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-mono">Disconnected</span>;
    }
    if (oauthStatus.status === 'connected') {
      // Check if expiring soon
      if (oauthStatus.tokenExpiresAt) {
        const daysLeft = Math.ceil((new Date(oauthStatus.tokenExpiresAt).getTime() - Date.now()) / 86400000);
        if (daysLeft <= 7) {
          return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300 font-mono">Expiring in {daysLeft}d</span>;
        }
      }
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 font-mono">Connected</span>;
    }
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 font-mono">{oauthStatus.status}</span>;
  };

  return (
    <PageShell title="Connections" subtitle="Manage data source integrations">
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* OAuth Platform Cards */}
      {OAUTH_PLATFORMS.map(({ key, label, icon, description }) => {
        const oauthStatus = getOAuthStatusForPlatform(key);
        const isConnected = oauthStatus?.status === 'connected';
        const isOAuthConnected = isConnected && oauthStatus?.connectionMethod === 'oauth';
        const showManual = expandedManual[key] || false;

        return (
          <div key={key} className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <h3 className="text-sm font-bold text-ats-text">{label}</h3>
              </div>
              {statusBadge(oauthStatus)}
            </div>
            <p className="text-xs text-ats-text-muted mb-3">{description}</p>

            {isOAuthConnected ? (
              <div className="space-y-2">
                {oauthStatus?.scopes && oauthStatus.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {oauthStatus.scopes.map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 bg-ats-bg rounded border border-[#374151] text-ats-text-muted font-mono">{s}</span>
                    ))}
                  </div>
                )}
                {oauthStatus?.tokenExpiresAt && (
                  <p className="text-[11px] text-ats-text-muted">
                    Token expires: {new Date(oauthStatus.tokenExpiresAt).toLocaleDateString()}
                  </p>
                )}
                <button
                  onClick={() => handleDisconnect(key)}
                  className="px-3 py-1.5 text-xs text-ats-red border border-red-900/50 rounded hover:bg-red-900/20 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Primary: OAuth button */}
                <OAuthConnectButton
                  platform={key}
                  onSuccess={handleOAuthSuccess}
                  onError={handleOAuthError}
                  storeUrl={key === 'shopify' ? shopifyStoreUrl : undefined}
                />

                {/* Shopify needs store URL before OAuth */}
                {key === 'shopify' && (
                  <div>
                    <label className={labelCls}>Store URL (required for OAuth)</label>
                    <input type="text" value={shopifyStoreUrl} onChange={(e) => setShopifyStoreUrl(e.target.value)}
                      placeholder="mystore.myshopify.com" className={inputCls} />
                  </div>
                )}

                {/* Manual fallback toggle */}
                {(key === 'meta' || key === 'google' || key === 'shopify') && (
                  <button
                    onClick={() => setExpandedManual(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="text-[11px] text-ats-text-muted hover:text-ats-text transition-colors"
                  >
                    {showManual ? 'Hide manual setup' : 'Or connect manually'}
                  </button>
                )}

                {/* Manual fields (collapsed by default) */}
                {showManual && key === 'meta' && (
                  <div className="space-y-3 pt-2 border-t border-[#374151]">
                    <div>
                      <label className={labelCls}>Access Token</label>
                      <input type="password" value={fbToken} onChange={(e) => setFbToken(e.target.value)}
                        placeholder={settings.fb_access_token || 'Enter Meta access token'} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Ad Account IDs</label>
                      <input type="text" value={fbAccountIds} onChange={(e) => setFbAccountIds(e.target.value)}
                        placeholder="act_123456789,act_987654321" className={inputCls} />
                      <div className="text-[11px] text-[#4b5563] mt-1">Comma-separated (include act_ prefix)</div>
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
                )}
                {showManual && key === 'shopify' && (
                  <div className="space-y-3 pt-2 border-t border-[#374151]">
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
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* CheckoutChamp (manual only) */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔵</span>
            <h3 className="text-sm font-bold text-ats-text">CheckoutChamp</h3>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
            ccTestStatus === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {ccTestStatus === 'success' ? 'Connected' : 'Manual'}
          </span>
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

      {/* Webhook Tokens */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-6">
        <h3 className="text-sm font-bold text-ats-text mb-1">Webhook Tokens</h3>
        <p className="text-xs text-ats-text-muted mb-4">
          Generate user-scoped webhook tokens. Orders received via token-based URLs are automatically associated with your account.
        </p>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select value={newTokenSource} onChange={(e) => setNewTokenSource(e.target.value)}
            className={`${inputCls} w-auto`}>
            <option value="checkout_champ">CheckoutChamp</option>
            <option value="shopify">Shopify</option>
          </select>
          <input type="text" value={newTokenLabel} onChange={(e) => setNewTokenLabel(e.target.value)}
            placeholder="Label (optional)" className={`${inputCls} flex-1 min-w-[150px]`} />
          <button onClick={handleCreateToken} disabled={creatingToken}
            className="px-4 py-2 bg-ats-accent text-white rounded-md text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 whitespace-nowrap">
            {creatingToken ? 'Creating...' : 'Generate Token'}
          </button>
        </div>

        {tokens.length === 0 ? (
          <div className="text-xs text-ats-text-muted text-center py-4">No webhook tokens yet</div>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => {
              const sourceRoute = t.source === 'shopify' ? 'shopify' : 'checkout-champ';
              const webhookUrl = `${webhookBaseUrl}/api/webhooks/${sourceRoute}/${t.token}`;
              return (
                <div key={t.id}
                  className={`p-3 rounded-lg border ${t.active ? 'border-ats-border bg-ats-bg' : 'border-[#374151] bg-ats-bg/50 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${t.active ? 'bg-ats-green' : 'bg-ats-red'}`} />
                      <span className="text-xs font-semibold text-ats-text uppercase">{t.source}</span>
                      {t.label && <span className="text-xs text-ats-text-muted">- {t.label}</span>}
                    </div>
                    {t.active && (
                      <button onClick={() => handleRevokeToken(t.id)}
                        className="text-xs text-ats-red hover:text-red-400 transition-colors">
                        Revoke
                      </button>
                    )}
                  </div>
                  {t.active && (
                    <div className="flex gap-2">
                      <input type="text" readOnly value={webhookUrl}
                        className="flex-1 px-2 py-1.5 bg-ats-bg border border-[#374151] rounded text-xs font-mono text-ats-text-muted outline-none" />
                      <button onClick={() => copyToClipboard(webhookUrl)}
                        className="px-3 py-1.5 bg-ats-border border border-[#374151] rounded text-xs text-ats-text-muted hover:bg-ats-hover transition-colors">
                        Copy
                      </button>
                    </div>
                  )}
                  <div className="text-[10px] text-ats-text-muted mt-1">
                    {t.last_used_at ? `Last used: ${new Date(t.last_used_at).toLocaleString()}` : 'Never used'}
                    {' | '}Created: {new Date(t.created_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
        {saving ? 'Saving...' : 'Save Manual Settings'}
      </button>
    </PageShell>
  );
}
