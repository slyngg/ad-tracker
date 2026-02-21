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
import { useTourStore } from '../../stores/tourStore';

type StatusType = 'idle' | 'testing' | 'success' | 'error';

interface PlatformDef {
  key: string;
  label: string;
  icon: string;
  iconBg: string;
  description: string;
  oauthPlatform?: string;
  manualFields?: 'meta' | 'google' | 'shopify' | 'checkoutchamp';
}

const PLATFORMS: PlatformDef[] = [
  { key: 'meta', label: 'Meta Ads', icon: 'f', iconBg: 'bg-blue-600', description: 'Facebook & Instagram ad campaigns, spend, ROAS, creative performance', oauthPlatform: 'meta', manualFields: 'meta' },
  { key: 'google', label: 'Google Analytics', icon: 'G', iconBg: 'bg-red-600', description: 'GA4 traffic, conversions, funnel analysis, site search', oauthPlatform: 'google', manualFields: 'google' },
  { key: 'shopify', label: 'Shopify', icon: 'S', iconBg: 'bg-green-600', description: 'Real-time orders, products, refund webhooks, revenue tracking', oauthPlatform: 'shopify', manualFields: 'shopify' },
  { key: 'tiktok', label: 'TikTok Ads', icon: 'T', iconBg: 'bg-pink-600', description: 'Campaign performance, spend, and conversion metrics', oauthPlatform: 'tiktok' },
  { key: 'klaviyo', label: 'Klaviyo', icon: 'K', iconBg: 'bg-purple-600', description: 'Email lists, profiles, campaign metrics, customer insights', oauthPlatform: 'klaviyo' },
  { key: 'checkoutchamp', label: 'CheckoutChamp', icon: 'C', iconBg: 'bg-indigo-600', description: 'Order data, subscriptions, take rates, upsell performance', manualFields: 'checkoutchamp' },
];

export default function ConnectionsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual fields
  const [fbToken, setFbToken] = useState('');
  const [fbAccountIds, setFbAccountIds] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4CredentialsJson, setGa4CredentialsJson] = useState('');
  const [ccLoginId, setCcLoginId] = useState('');
  const [ccPassword, setCcPassword] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  const [ccPollEnabled, setCcPollEnabled] = useState(true);
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');

  const [fbTestStatus, setFbTestStatus] = useState<StatusType>('idle');
  const [fbTestMessage, setFbTestMessage] = useState('');
  const [ccTestStatus, setCcTestStatus] = useState<StatusType>('idle');
  const [ccTestMessage, setCcTestMessage] = useState('');

  // OAuth + UI state
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Webhook tokens
  const [tokens, setTokens] = useState<WebhookToken[]>([]);
  const [newTokenSource, setNewTokenSource] = useState('checkout_champ');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [showTokenSection, setShowTokenSection] = useState(false);

  const loadOAuthStatus = useCallback(async () => {
    try { setOauthStatuses(await getOAuthStatus()); } catch {}
  }, []);
  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setFbAccountIds(s.fb_ad_account_ids || '');
      setCcApiUrl(s.cc_api_url || '');
      setCcPollEnabled(s.cc_poll_enabled !== 'false');
      setShopifyStoreUrl(s.shopify_store_url || '');
      setGa4PropertyId(s.ga4_property_id || '');
    } catch {}
  }, []);
  const loadTokens = useCallback(async () => {
    try { setTokens(await fetchWebhookTokens()); } catch {}
  }, []);

  useEffect(() => { loadSettings(); loadOAuthStatus(); loadTokens(); }, [loadSettings, loadOAuthStatus, loadTokens]);

  // Helpers
  const oauthFor = (platform: string) => oauthStatuses.find(s => s.platform === platform);
  const isOAuthConnected = (platform: string) => {
    const s = oauthFor(platform);
    return s?.status === 'connected' && s.connectionMethod === 'oauth';
  };
  const isAnyConnected = (platform: string) => {
    if (oauthFor(platform)?.status === 'connected') return true;
    if (platform === 'meta') return !!(settings.fb_access_token && settings.fb_ad_account_ids);
    if (platform === 'google') return !!settings.ga4_property_id;
    if (platform === 'shopify') return !!settings.shopify_webhook_secret;
    if (platform === 'checkoutchamp') return !!(settings.cc_login_id && settings.cc_password);
    return false;
  };
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const copy = (text: string) => { navigator.clipboard.writeText(text); flash('Copied!', 'success'); };
  const flash = (text: string, type: 'success' | 'error') => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); };

  const connectedCount = PLATFORMS.filter(p => isAnyConnected(p.oauthPlatform || p.key)).length;

  // Actions
  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      if (fbToken) data.fb_access_token = fbToken;
      if (fbAccountIds) data.fb_ad_account_ids = fbAccountIds;
      if (ga4PropertyId) data.ga4_property_id = ga4PropertyId;
      if (ga4CredentialsJson) data.ga4_credentials_json = ga4CredentialsJson;
      if (ccLoginId) data.cc_login_id = ccLoginId;
      if (ccPassword) data.cc_password = ccPassword;
      if (ccApiUrl) data.cc_api_url = ccApiUrl;
      if (ccWebhookSecret) data.cc_webhook_secret = ccWebhookSecret;
      data.cc_poll_enabled = ccPollEnabled ? 'true' : 'false';
      if (shopifySecret) data.shopify_webhook_secret = shopifySecret;
      if (shopifyStoreUrl) data.shopify_store_url = shopifyStoreUrl;
      const updated = await updateSettings(data);
      setSettings(updated);
      setFbToken(''); setCcLoginId(''); setCcPassword(''); setCcWebhookSecret(''); setShopifySecret('');
      flash('Settings saved', 'success');
    } catch { flash('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}? You can reconnect anytime.`)) return;
    try { await disconnectOAuth(platform); await loadOAuthStatus(); flash('Disconnected', 'success'); }
    catch { flash('Failed to disconnect', 'error'); }
  };

  const handleTestFB = async () => {
    setFbTestStatus('testing');
    try {
      const r = await testFacebookConnection();
      setFbTestStatus(r.success ? 'success' : 'error');
      setFbTestMessage(r.success ? (r.account_name || 'Connected') : (r.error || 'Failed'));
    } catch { setFbTestStatus('error'); setFbTestMessage('Connection failed'); }
  };
  const handleTestCC = async () => {
    setCcTestStatus('testing');
    try {
      const r = await testCCConnection();
      setCcTestStatus(r.success ? 'success' : 'error');
      setCcTestMessage(r.success ? (r.message || 'Connected') : (r.error || 'Failed'));
    } catch { setCcTestStatus('error'); setCcTestMessage('Connection failed'); }
  };

  const handleCreateToken = async () => {
    setCreatingToken(true);
    try { await createWebhookToken(newTokenSource, newTokenLabel || undefined); setNewTokenLabel(''); loadTokens(); flash('Token created', 'success'); }
    catch { flash('Failed to create token', 'error'); }
    finally { setCreatingToken(false); }
  };
  const handleRevokeToken = async (id: number) => {
    if (!confirm('Revoke this token? Webhooks using it will stop.')) return;
    try { await revokeWebhookToken(id); loadTokens(); flash('Revoked', 'success'); }
    catch { flash('Failed to revoke', 'error'); }
  };

  // Styles
  const inputCls = 'w-full px-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm font-mono outline-none focus:border-ats-accent focus:ring-1 focus:ring-ats-accent/30 transition-all';
  const labelCls = 'text-[10px] text-ats-text-muted block mb-1.5 uppercase tracking-widest font-mono';
  const btnSecondary = 'px-4 py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-medium hover:bg-ats-hover active:scale-[0.98] transition-all';

  const statusBadge = (platform: string) => {
    const connected = isAnyConnected(platform);
    const oauth = oauthFor(platform);
    if (connected) {
      if (oauth?.tokenExpiresAt) {
        const days = Math.ceil((new Date(oauth.tokenExpiresAt).getTime() - Date.now()) / 86400000);
        if (days <= 7) return <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">Expiring {days}d</span>;
      }
      return <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">Connected</span>;
    }
    return <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-ats-text-muted font-medium">Not connected</span>;
  };

  return (
    <PageShell title="Connections" subtitle="Manage integrations and data sources">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-sm animate-in slide-in-from-right ${
          message.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Summary */}
      <div data-tour="connection-summary" className="bg-gradient-to-r from-ats-card to-ats-surface rounded-2xl border border-ats-border p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-lg font-bold text-ats-text">{connectedCount} of {PLATFORMS.length}</div>
            <div className="text-xs text-ats-text-muted">integrations active</div>
          </div>
          <div className="flex -space-x-1">
            {PLATFORMS.map(p => (
              <div key={p.key} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-ats-card ${
                isAnyConnected(p.oauthPlatform || p.key) ? p.iconBg : 'bg-gray-700'
              }`}>
                {p.icon}
              </div>
            ))}
          </div>
        </div>
        <div className="h-1.5 bg-ats-border rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-ats-accent to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${(connectedCount / PLATFORMS.length) * 100}%` }} />
        </div>
      </div>

      {/* Platform Cards */}
      <div className="space-y-3">
        {PLATFORMS.map((platform, platformIdx) => {
          const platformKey = platform.oauthPlatform || platform.key;
          const connected = isAnyConnected(platformKey);
          const oauthConnected = platform.oauthPlatform ? isOAuthConnected(platform.oauthPlatform) : false;
          const oauth = platform.oauthPlatform ? oauthFor(platform.oauthPlatform) : undefined;
          const isExpanded = expanded[platform.key] || false;
          const hasManual = !!platform.manualFields;

          return (
            <div key={platform.key} data-tour={platformIdx === 0 ? 'platform-card-first' : undefined} className={`rounded-2xl border transition-all ${
              connected ? 'bg-ats-card border-emerald-800/30' : 'bg-ats-card border-ats-border'
            }`}>
              {/* Card Header — always visible */}
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0 ${platform.iconBg}`}>
                    {platform.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-ats-text">{platform.label}</h3>
                      {statusBadge(platformKey)}
                    </div>
                    <p className="text-xs text-ats-text-muted mt-0.5 line-clamp-1">{platform.description}</p>
                  </div>
                </div>

                {/* Actions row */}
                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {connected ? (
                    <>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-xs text-emerald-400 font-medium truncate">
                          {oauthConnected ? 'Connected via OAuth' : 'Connected manually'}
                        </span>
                        {oauth?.tokenExpiresAt && (
                          <span className="text-[10px] text-ats-text-muted font-mono hidden sm:inline">
                            · expires {new Date(oauth.tokenExpiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {hasManual && (
                          <button onClick={() => toggle(platform.key)} className={btnSecondary}>
                            {isExpanded ? 'Hide' : 'Settings'}
                          </button>
                        )}
                        {oauthConnected && platform.oauthPlatform && (
                          <button onClick={() => handleDisconnect(platform.oauthPlatform!)}
                            className="px-4 py-2 rounded-lg text-xs font-medium text-red-400 border border-red-900/40 hover:bg-red-900/20 active:scale-[0.98] transition-all">
                            Disconnect
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {platform.oauthPlatform && (
                        <OAuthConnectButton
                          platform={platform.oauthPlatform}
                          onSuccess={() => { loadOAuthStatus(); flash('Connected!', 'success'); useTourStore.getState().advanceEvent(); }}
                          onError={(msg) => flash(msg, 'error')}
                          storeUrl={platform.key === 'shopify' ? shopifyStoreUrl : undefined}
                          className="flex-1 sm:flex-none px-5 py-2.5 bg-ats-accent text-white rounded-xl text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60"
                        />
                      )}
                      {hasManual && (
                        <button onClick={() => toggle(platform.key)} className={`${btnSecondary} ${!platform.oauthPlatform ? 'flex-1 sm:flex-none bg-ats-accent text-white border-ats-accent hover:bg-blue-600' : ''}`}>
                          {platform.oauthPlatform ? (isExpanded ? 'Hide manual' : 'Manual setup') : (isExpanded ? 'Hide' : 'Configure')}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Scopes (when OAuth connected) */}
                {oauthConnected && oauth?.scopes && oauth.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {oauth.scopes.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-ats-text-muted font-mono">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Manual Config */}
              {isExpanded && (
                <div className="border-t border-ats-border px-4 sm:px-5 py-4 space-y-3 bg-ats-bg/50 rounded-b-2xl">
                  {/* Shopify store URL (needed before OAuth) */}
                  {platform.manualFields === 'shopify' && (
                    <>
                      <div>
                        <label className={labelCls}>Store URL</label>
                        <input type="text" value={shopifyStoreUrl} onChange={e => setShopifyStoreUrl(e.target.value)}
                          placeholder="mystore.myshopify.com" className={inputCls} />
                        <div className="text-[10px] text-ats-text-muted mt-1">Required for OAuth connect</div>
                      </div>
                      <div>
                        <label className={labelCls}>Webhook Secret</label>
                        <input type="password" value={shopifySecret} onChange={e => setShopifySecret(e.target.value)}
                          placeholder={settings.shopify_webhook_secret || 'shpss_...'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Webhook URL</label>
                        <div className="flex gap-2">
                          <input readOnly value={`${webhookBaseUrl}/api/webhooks/shopify`} className={`${inputCls} text-ats-text-muted flex-1`} />
                          <button onClick={() => copy(`${webhookBaseUrl}/api/webhooks/shopify`)} className={btnSecondary}>Copy</button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Meta manual */}
                  {platform.manualFields === 'meta' && (
                    <>
                      <div>
                        <label className={labelCls}>Access Token</label>
                        <input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)}
                          placeholder={settings.fb_access_token || 'EAAxxxxxxxx...'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Ad Account IDs</label>
                        <input type="text" value={fbAccountIds} onChange={e => setFbAccountIds(e.target.value)}
                          placeholder="act_123456789, act_987654321" className={inputCls} />
                        <div className="text-[10px] text-ats-text-muted mt-1">Comma-separated, include act_ prefix</div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <button onClick={handleTestFB} className={btnSecondary}>
                          {fbTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                        </button>
                        {fbTestMessage && <span className={`text-xs ${fbTestStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{fbTestMessage}</span>}
                      </div>
                    </>
                  )}

                  {/* Google manual */}
                  {platform.manualFields === 'google' && (
                    <>
                      <div>
                        <label className={labelCls}>GA4 Property ID</label>
                        <input type="text" value={ga4PropertyId} onChange={e => setGa4PropertyId(e.target.value)}
                          placeholder="properties/123456789" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Service Account JSON</label>
                        <textarea rows={3} value={ga4CredentialsJson} onChange={e => setGa4CredentialsJson(e.target.value)}
                          placeholder='{"type":"service_account","project_id":"..."}' className={`${inputCls} resize-none`} />
                      </div>
                    </>
                  )}

                  {/* CheckoutChamp manual */}
                  {platform.manualFields === 'checkoutchamp' && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Login ID</label>
                          <input type="text" value={ccLoginId} onChange={e => setCcLoginId(e.target.value)}
                            placeholder={settings.cc_login_id || 'API user login ID'} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Password</label>
                          <input type="password" value={ccPassword} onChange={e => setCcPassword(e.target.value)}
                            placeholder={settings.cc_password || 'API user password'} className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>API Base URL</label>
                        <input type="text" value={ccApiUrl} onChange={e => setCcApiUrl(e.target.value)}
                          placeholder={settings.cc_api_url || 'https://api.checkoutchamp.com'} className={inputCls} />
                        <div className="text-[10px] text-ats-text-muted mt-1">Default: https://api.checkoutchamp.com</div>
                      </div>
                      <div>
                        <label className={labelCls}>Webhook Secret</label>
                        <input type="password" value={ccWebhookSecret} onChange={e => setCcWebhookSecret(e.target.value)}
                          placeholder={settings.cc_webhook_secret || 'whsec_...'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Webhook URL</label>
                        <div className="flex gap-2">
                          <input readOnly value={`${webhookBaseUrl}/api/webhooks/checkout-champ`} className={`${inputCls} text-ats-text-muted flex-1`} />
                          <button onClick={() => copy(`${webhookBaseUrl}/api/webhooks/checkout-champ`)} className={btnSecondary}>Copy</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className={`${labelCls} mb-0`}>API Polling</label>
                        <button onClick={() => setCcPollEnabled(!ccPollEnabled)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${ccPollEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-ats-text-muted'}`}>
                          {ccPollEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <button onClick={handleTestCC} className={btnSecondary}>
                          {ccTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                        </button>
                        {ccTestMessage && <span className={`text-xs ${ccTestStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{ccTestMessage}</span>}
                      </div>
                    </>
                  )}

                  {/* Per-section save */}
                  <button onClick={handleSave} disabled={saving}
                    className="w-full py-2.5 bg-ats-accent text-white rounded-xl text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Webhook Tokens — collapsible */}
      <div className="mt-6">
        <button onClick={() => setShowTokenSection(!showTokenSection)}
          className="flex items-center gap-2 text-sm font-semibold text-ats-text mb-3 hover:text-ats-accent transition-colors">
          <span className={`transition-transform ${showTokenSection ? 'rotate-90' : ''}`}>&#9654;</span>
          Webhook Tokens
          {tokens.length > 0 && <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-ats-text-muted font-mono">{tokens.length}</span>}
        </button>

        {showTokenSection && (
          <div className="bg-ats-card rounded-2xl border border-ats-border p-4 sm:p-5">
            <p className="text-xs text-ats-text-muted mb-4">
              Generate user-scoped webhook tokens. Orders received via token-based URLs are automatically associated with your account.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <select value={newTokenSource} onChange={e => setNewTokenSource(e.target.value)}
                className={`${inputCls} sm:w-auto`}>
                <option value="checkout_champ">CheckoutChamp</option>
                <option value="shopify">Shopify</option>
              </select>
              <input type="text" value={newTokenLabel} onChange={e => setNewTokenLabel(e.target.value)}
                placeholder="Label (optional)" className={`${inputCls} flex-1`} />
              <button onClick={handleCreateToken} disabled={creatingToken}
                className="px-5 py-2.5 bg-ats-accent text-white rounded-xl text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 whitespace-nowrap">
                {creatingToken ? 'Creating...' : 'Generate'}
              </button>
            </div>

            {tokens.length === 0 ? (
              <div className="text-xs text-ats-text-muted text-center py-6 bg-ats-bg/50 rounded-xl">No tokens yet</div>
            ) : (
              <div className="space-y-2">
                {tokens.map(t => {
                  const route = t.source === 'shopify' ? 'shopify' : 'checkout-champ';
                  const url = `${webhookBaseUrl}/api/webhooks/${route}/${t.token}`;
                  return (
                    <div key={t.id} className={`p-3 rounded-xl border ${t.active ? 'border-ats-border bg-ats-bg/50' : 'border-ats-border/50 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-xs font-semibold text-ats-text uppercase">{t.source.replace('_', ' ')}</span>
                          {t.label && <span className="text-xs text-ats-text-muted">· {t.label}</span>}
                        </div>
                        {t.active && (
                          <button onClick={() => handleRevokeToken(t.id)} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">Revoke</button>
                        )}
                      </div>
                      {t.active && (
                        <div className="flex gap-2">
                          <input readOnly value={url} className="flex-1 px-2.5 py-1.5 bg-ats-bg border border-ats-border rounded-lg text-[11px] font-mono text-ats-text-muted outline-none" />
                          <button onClick={() => copy(url)} className="px-3 py-1.5 bg-ats-surface border border-ats-border rounded-lg text-[11px] text-ats-text-muted hover:bg-ats-hover transition-colors">Copy</button>
                        </div>
                      )}
                      <div className="text-[9px] text-ats-text-muted mt-1.5 font-mono">
                        {t.last_used_at ? `Used ${new Date(t.last_used_at).toLocaleString()}` : 'Never used'} · Created {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
