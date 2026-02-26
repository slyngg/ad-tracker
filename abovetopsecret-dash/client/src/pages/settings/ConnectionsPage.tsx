import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchSettings,
  updateSettings,
  testFacebookConnection,
  testCCConnection,
  testNewsBreakConnection,
  fetchWebhookTokens,
  createWebhookToken,
  revokeWebhookToken,
  getOAuthStatus,
  disconnectOAuth,
  fetchAccounts,
  createAccount,
  deleteAccount,
  testAccountConnection,
  WebhookToken,
  OAuthStatus,
  Account,
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
  manualFields?: 'meta' | 'google' | 'shopify' | 'checkoutchamp' | 'newsbreak';
}

const PLATFORMS: PlatformDef[] = [
  { key: 'meta', label: 'Meta / Facebook Ads', icon: 'f', iconBg: 'bg-blue-600', description: 'Pull ad spend, ROAS, creative performance, and attribution data.', oauthPlatform: 'meta', manualFields: 'meta' },
  { key: 'google', label: 'Google Analytics 4', icon: 'G', iconBg: 'bg-red-600', description: 'Connect for traffic analytics, funnel analysis, and conversion data.', oauthPlatform: 'google', manualFields: 'google' },
  { key: 'shopify', label: 'Shopify', icon: 'S', iconBg: 'bg-green-600', description: 'Connect for order data, product insights, and webhook-based real-time updates.', oauthPlatform: 'shopify', manualFields: 'shopify' },
  { key: 'tiktok', label: 'TikTok Ads', icon: 'T', iconBg: 'bg-pink-600', description: 'Connect for campaign performance and spend data.', oauthPlatform: 'tiktok' },
  { key: 'klaviyo', label: 'Klaviyo', icon: 'K', iconBg: 'bg-purple-600', description: 'Connect for email list metrics, campaign performance, and customer profiles.', oauthPlatform: 'klaviyo' },
  { key: 'checkoutchamp', label: 'CheckoutChamp', icon: 'C', iconBg: 'bg-indigo-600', description: 'Add the webhook URL as a postback in your CC campaign settings, or enter API credentials for polling.', manualFields: 'checkoutchamp' },
  { key: 'newsbreak', label: 'NewsBreak Ads', icon: 'N', iconBg: 'bg-orange-600', description: 'Connect for campaign performance, ad spend, and conversion data.', manualFields: 'newsbreak' },
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

  // NewsBreak multi-account
  const [nbAccounts, setNbAccounts] = useState<Account[]>([]);
  const [nbShowAddForm, setNbShowAddForm] = useState(false);
  const [nbNewName, setNbNewName] = useState('');
  const [nbNewApiKey, setNbNewApiKey] = useState('');
  const [nbNewAccountId, setNbNewAccountId] = useState('');
  const [nbAddingAccount, setNbAddingAccount] = useState(false);
  const [nbTestingAccounts, setNbTestingAccounts] = useState<Record<number, StatusType>>({});
  const [nbTestMessages, setNbTestMessages] = useState<Record<number, string>>({});

  // Legacy single-account (still shown as fallback if no accounts exist)
  const [nbApiKey, setNbApiKey] = useState('');
  const [nbAccountId, setNbAccountId] = useState('');

  const [fbTestStatus, setFbTestStatus] = useState<StatusType>('idle');
  const [fbTestMessage, setFbTestMessage] = useState('');
  const [ccTestStatus, setCcTestStatus] = useState<StatusType>('idle');
  const [ccTestMessage, setCcTestMessage] = useState('');
  const [nbTestStatus, setNbTestStatus] = useState<StatusType>('idle');
  const [nbTestMessage, setNbTestMessage] = useState('');

  // OAuth + UI state
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Webhook tokens
  const [tokens, setTokens] = useState<WebhookToken[]>([]);
  const [newTokenSource, setNewTokenSource] = useState('checkout_champ');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [showTokenSection, setShowTokenSection] = useState(false);

  // Auto-save: debounce saving whenever manual fields change
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSave = useCallback((data: Record<string, string>) => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      try {
        await updateSettings(data);
        // Don't call setSettings here — server returns masked values that would
        // overwrite the real values in state and break isAnyConnected checks
      } catch {}
    }, 800);
  }, []);

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
      setNbAccountId(s.newsbreak_account_id || '');
    } catch {}
  }, []);
  const loadTokens = useCallback(async () => {
    try { setTokens(await fetchWebhookTokens()); } catch {}
  }, []);
  const loadNbAccounts = useCallback(async () => {
    try {
      const all = await fetchAccounts();
      setNbAccounts(all.filter(a => a.platform === 'newsbreak' && a.status !== 'archived'));
    } catch {}
  }, []);

  useEffect(() => { loadSettings(); loadOAuthStatus(); loadTokens(); loadNbAccounts(); }, [loadSettings, loadOAuthStatus, loadTokens, loadNbAccounts]);

  // Helpers
  const oauthFor = (platform: string) => oauthStatuses.find(s => s.platform === platform);
  const isOAuthConnected = (platform: string) => {
    const s = oauthFor(platform);
    return s?.status === 'connected' && s.connectionMethod === 'oauth';
  };
  const isExpired = (platform: string) => oauthFor(platform)?.status === 'expired';
  const isAnyConnected = (platform: string) => {
    const oauth = oauthFor(platform);
    if (oauth?.status === 'connected') return true;
    if (oauth?.status === 'expired') return false;
    if (platform === 'meta') return !!(settings.fb_access_token && settings.fb_ad_account_ids);
    if (platform === 'google') return !!settings.ga4_property_id;
    if (platform === 'shopify') return !!settings.shopify_webhook_secret;
    if (platform === 'checkoutchamp') return !!(settings.cc_login_id && settings.cc_password);
    if (platform === 'newsbreak') return nbAccounts.some(a => a.has_access_token && a.platform_account_id) || !!(settings.newsbreak_api_key && settings.newsbreak_account_id);
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
      if (nbApiKey) data.newsbreak_api_key = nbApiKey;
      if (nbAccountId) data.newsbreak_account_id = nbAccountId;
      await updateSettings(data);
      // Reload to get fresh state (server masks sensitive values but we keep local state)
      await loadSettings();
      flash('Settings saved', 'success');
    } catch { flash('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}? You can reconnect anytime.`)) return;
    try { await disconnectOAuth(platform); await loadOAuthStatus(); flash('Disconnected', 'success'); }
    catch { flash('Failed to disconnect', 'error'); }
  };

  const handleDisconnectManual = async (platformKey: string) => {
    if (!confirm(`Disconnect ${platformKey}? You can reconnect anytime.`)) return;
    try {
      const data: Record<string, string> = {};
      if (platformKey === 'meta') { data.fb_access_token = ''; data.fb_ad_account_ids = ''; }
      else if (platformKey === 'google') { data.ga4_property_id = ''; data.ga4_credentials_json = ''; }
      else if (platformKey === 'shopify') { data.shopify_webhook_secret = ''; data.shopify_store_url = ''; }
      else if (platformKey === 'checkoutchamp') { data.cc_login_id = ''; data.cc_password = ''; data.cc_api_url = ''; data.cc_webhook_secret = ''; }
      else if (platformKey === 'newsbreak') { data.newsbreak_api_key = ''; data.newsbreak_account_id = ''; }
      await updateSettings(data);
      if (platformKey === 'meta') { setFbToken(''); setFbAccountIds(''); }
      else if (platformKey === 'google') { setGa4PropertyId(''); setGa4CredentialsJson(''); }
      else if (platformKey === 'shopify') { setShopifySecret(''); setShopifyStoreUrl(''); }
      else if (platformKey === 'checkoutchamp') { setCcLoginId(''); setCcPassword(''); setCcApiUrl(''); setCcWebhookSecret(''); }
      else if (platformKey === 'newsbreak') {
        setNbApiKey(''); setNbAccountId('');
        // Also archive all multi-account entries
        for (const acct of nbAccounts) {
          try { await deleteAccount(acct.id); } catch {}
        }
        await loadNbAccounts();
      }
      await loadSettings();
      setExpanded(p => ({ ...p, [platformKey]: false }));
      flash('Disconnected', 'success');
    } catch { flash('Failed to disconnect', 'error'); }
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

  const handleTestNB = async () => {
    setNbTestStatus('testing');
    try {
      const r = await testNewsBreakConnection();
      setNbTestStatus(r.success ? 'success' : 'error');
      setNbTestMessage(r.success ? (r.message || 'Connected') : (r.error || 'Failed'));
    } catch { setNbTestStatus('error'); setNbTestMessage('Connection failed'); }
  };

  const handleAddNbAccount = async () => {
    if (!nbNewName.trim() || !nbNewApiKey.trim() || !nbNewAccountId.trim()) return;
    setNbAddingAccount(true);
    try {
      await createAccount({
        name: nbNewName.trim(),
        platform: 'newsbreak',
        platform_account_id: nbNewAccountId.trim(),
        access_token: nbNewApiKey.trim(),
        color: '#e11d48',
      } as any);
      setNbNewName('');
      setNbNewApiKey('');
      setNbNewAccountId('');
      setNbShowAddForm(false);
      await loadNbAccounts();
      flash('NewsBreak account added', 'success');
    } catch { flash('Failed to add account', 'error'); }
    finally { setNbAddingAccount(false); }
  };

  const handleTestNbAccount = async (id: number) => {
    setNbTestingAccounts(p => ({ ...p, [id]: 'testing' }));
    setNbTestMessages(p => ({ ...p, [id]: '' }));
    try {
      const r = await testAccountConnection(id);
      setNbTestingAccounts(p => ({ ...p, [id]: r.success ? 'success' : 'error' }));
      setNbTestMessages(p => ({ ...p, [id]: r.success ? (r.message || 'Connected') : (r.error || 'Failed') }));
    } catch {
      setNbTestingAccounts(p => ({ ...p, [id]: 'error' }));
      setNbTestMessages(p => ({ ...p, [id]: 'Connection failed' }));
    }
  };

  const handleRemoveNbAccount = async (id: number) => {
    if (!confirm('Remove this NewsBreak account? Data already synced will be kept.')) return;
    try {
      await deleteAccount(id);
      await loadNbAccounts();
      flash('Account removed', 'success');
    } catch { flash('Failed to remove account', 'error'); }
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
  const inputCls = 'w-full px-3 py-2 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-xs font-mono outline-none focus:border-ats-accent focus:ring-1 focus:ring-ats-accent/30 transition-all';
  const labelCls = 'text-[10px] text-ats-text-muted block mb-1 uppercase tracking-widest font-mono';
  const btnSecondary = 'px-3 py-1.5 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-medium hover:bg-ats-hover active:scale-[0.98] transition-all';
  const btnDanger = 'px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-900/40 hover:bg-red-900/20 active:scale-[0.98] transition-all';

  const statusDot = (platform: string) => {
    const connected = isAnyConnected(platform);
    const expired = isExpired(platform);
    const oauth = oauthFor(platform);

    if (expired) {
      return (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-[10px] text-red-400">Expired — reconnect</span>
        </span>
      );
    }

    if (connected && oauth?.tokenExpiresAt) {
      const days = Math.ceil((new Date(oauth.tokenExpiresAt).getTime() - Date.now()) / 86400000);
      if (days <= 7) return <span className="text-[10px] text-amber-400 whitespace-nowrap">Expiring {days}d</span>;
    }

    return (
      <span className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-ats-text-muted'}`} />
        <span className={`text-[10px] ${connected ? 'text-emerald-400' : 'text-ats-text-muted'}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </span>
    );
  };

  return (
    <PageShell title="Connections" subtitle="Connect your platforms to start syncing data.">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl backdrop-blur-sm ${
          message.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Summary strip */}
      <div data-tour="connection-summary" className="bg-ats-card rounded-xl border border-ats-border px-3 py-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap text-xs text-ats-text-muted">
          {PLATFORMS.map(p => (
            <span key={p.key} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isAnyConnected(p.oauthPlatform || p.key) ? 'bg-emerald-500' : isExpired(p.oauthPlatform || p.key) ? 'bg-red-500' : 'bg-ats-text-muted'}`} />
              {p.key === 'checkoutchamp' ? 'CC' : p.key.charAt(0).toUpperCase() + p.key.slice(1)}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-ats-text-muted mt-1.5">{connectedCount}/{PLATFORMS.length} connected</div>
      </div>

      {/* Platform Cards */}
      <div className="space-y-2">
        {PLATFORMS.map((platform, platformIdx) => {
          const platformKey = platform.oauthPlatform || platform.key;
          const connected = isAnyConnected(platformKey);
          const expired = isExpired(platformKey);
          const oauthConnected = platform.oauthPlatform ? isOAuthConnected(platform.oauthPlatform) : false;
          const oauth = platform.oauthPlatform ? oauthFor(platform.oauthPlatform) : undefined;
          const isExpanded = expanded[platform.key] || false;
          const hasManual = !!platform.manualFields;

          return (
            <div key={platform.key} data-tour={platformIdx === 0 ? 'platform-card-first' : undefined} className={`rounded-xl border transition-all ${
              expired ? 'bg-ats-card border-red-900/40' : connected ? 'bg-ats-card border-emerald-800/30' : 'bg-ats-card border-ats-border'
            }`}>
              {/* Header */}
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0 ${platform.iconBg}`}>
                      {platform.icon}
                    </div>
                    <h3 className="text-sm font-bold text-ats-text truncate">{platform.label}</h3>
                  </div>
                  {statusDot(platformKey)}
                </div>

                {/* Description */}
                <p className="text-[11px] text-ats-text-muted mt-1.5 leading-relaxed">{platform.description}</p>

                {/* Shopify store URL — inline when not connected (needed before OAuth) */}
                {platform.key === 'shopify' && !connected && (
                  <div className="mt-2.5">
                    <label className={labelCls}>Store URL (required)</label>
                    <input type="text" value={shopifyStoreUrl} onChange={e => setShopifyStoreUrl(e.target.value)}
                      placeholder="mystore.myshopify.com" className={inputCls} />
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {connected && !expired ? (
                    <>
                      {hasManual && !oauthConnected && (
                        <button onClick={() => toggle(platform.key)} className={btnSecondary}>
                          {isExpanded ? 'Hide' : 'Settings'}
                        </button>
                      )}
                      <button
                        onClick={() => oauthConnected && platform.oauthPlatform
                          ? handleDisconnect(platform.oauthPlatform!)
                          : handleDisconnectManual(platform.key)}
                        className={btnDanger}>
                        Disconnect
                      </button>
                      {oauth?.tokenExpiresAt && (
                        <span className="text-[10px] text-ats-text-muted font-mono ml-auto">
                          expires {new Date(oauth.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {platform.oauthPlatform && (
                        <OAuthConnectButton
                          platform={platform.oauthPlatform}
                          onSuccess={() => { loadOAuthStatus(); flash('Connected!', 'success'); useTourStore.getState().advanceEvent(); }}
                          onError={(msg) => flash(msg, 'error')}
                          storeUrl={platform.key === 'shopify' ? shopifyStoreUrl : undefined}
                          className="px-4 py-2 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60"
                        />
                      )}
                      {hasManual && (
                        <button onClick={() => toggle(platform.key)} className={`text-xs text-ats-text-muted hover:text-ats-text transition-colors ${!platform.oauthPlatform ? 'px-4 py-2 bg-ats-accent text-white rounded-lg font-semibold hover:bg-blue-600 hover:text-white' : ''}`}>
                          {platform.oauthPlatform ? (isExpanded ? 'Hide' : 'Or enter manually') : (isExpanded ? 'Hide' : 'Configure')}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Scopes */}
                {oauthConnected && oauth?.scopes && oauth.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {oauth.scopes.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-ats-text-muted font-mono">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Manual Config */}
              {isExpanded && (
                <div className="border-t border-ats-border px-3 sm:px-4 py-3 space-y-2.5 bg-ats-bg/50 rounded-b-xl">
                  {/* Shopify */}
                  {platform.manualFields === 'shopify' && (
                    <>
                      {connected && (
                        <div>
                          <label className={labelCls}>Store URL</label>
                          <input type="text" value={shopifyStoreUrl} onChange={e => setShopifyStoreUrl(e.target.value)}
                            placeholder="mystore.myshopify.com" className={inputCls} />
                        </div>
                      )}
                      <div>
                        <label className={labelCls}>Webhook Secret</label>
                        <input type="password" value={shopifySecret} onChange={e => setShopifySecret(e.target.value)}
                          placeholder={settings.shopify_webhook_secret || 'shpss_...'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Webhook URL</label>
                        <div className="flex gap-1.5">
                          <input readOnly value={`${webhookBaseUrl}/api/webhooks/shopify`} className={`${inputCls} text-ats-text-muted flex-1 min-w-0`} />
                          <button onClick={() => copy(`${webhookBaseUrl}/api/webhooks/shopify`)} className={`${btnSecondary} shrink-0`}>Copy</button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Meta manual */}
                  {platform.manualFields === 'meta' && !oauthConnected && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-ats-text-muted uppercase tracking-widest font-mono">Access Token</label>
                          <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-ats-accent hover:underline transition-colors">
                            Generate token &rarr;
                          </a>
                        </div>
                        <input type="password" value={fbToken} onChange={e => { setFbToken(e.target.value); autoSave({ fb_access_token: e.target.value }); }}
                          placeholder={settings.fb_access_token ? '••••••••' : 'EAAxxxxxxxx...'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Ad Account IDs</label>
                        <input type="text" value={fbAccountIds} onChange={e => { setFbAccountIds(e.target.value); autoSave({ fb_ad_account_ids: e.target.value }); }}
                          placeholder="act_123456789, act_987654321" className={inputCls} />
                        <div className="text-[10px] text-ats-text-muted mt-0.5">Comma-separated, include act_ prefix</div>
                      </div>
                      <div className="flex items-center gap-2">
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

                  {/* CheckoutChamp */}
                  {platform.manualFields === 'checkoutchamp' && (
                    <>
                      <div>
                        <label className={labelCls}>Webhook URL</label>
                        <div className="flex gap-1.5">
                          <input readOnly value={`${webhookBaseUrl}/api/webhooks/checkout-champ`} className={`${inputCls} text-ats-text-muted flex-1 min-w-0`} />
                          <button onClick={() => copy(`${webhookBaseUrl}/api/webhooks/checkout-champ`)} className={`${btnSecondary} shrink-0`}>Copy</button>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>API Login ID</label>
                        <input type="password" value={ccLoginId} onChange={e => { setCcLoginId(e.target.value); autoSave({ cc_login_id: e.target.value }); }}
                          placeholder={settings.cc_login_id ? '••••••••' : 'Your CC API login ID'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>API Password</label>
                        <input type="password" value={ccPassword} onChange={e => { setCcPassword(e.target.value); autoSave({ cc_password: e.target.value }); }}
                          placeholder={settings.cc_password ? '••••••••' : 'Your CC API password'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>API Base URL</label>
                        <input type="text" value={ccApiUrl} onChange={e => { setCcApiUrl(e.target.value); autoSave({ cc_api_url: e.target.value }); }}
                          placeholder={settings.cc_api_url || 'https://api.checkoutchamp.com'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Webhook Secret</label>
                        <input type="password" value={ccWebhookSecret} onChange={e => { setCcWebhookSecret(e.target.value); autoSave({ cc_webhook_secret: e.target.value }); }}
                          placeholder={settings.cc_webhook_secret ? '••••••••' : 'whsec_...'} className={inputCls} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleTestCC} className={btnSecondary}>
                          {ccTestStatus === 'testing' ? 'Testing...' : 'Test API Connection'}
                        </button>
                        {ccTestMessage && <span className={`text-xs ${ccTestStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{ccTestMessage}</span>}
                      </div>
                    </>
                  )}

                  {/* NewsBreak — Multi-account */}
                  {platform.manualFields === 'newsbreak' && (
                    <>
                      {/* Connected accounts list */}
                      {nbAccounts.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Connected Accounts ({nbAccounts.length})</div>
                          {nbAccounts.map(acct => (
                            <div key={acct.id} className="flex items-center gap-2 p-2 rounded-lg bg-ats-bg border border-ats-border">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color || '#e11d48' }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-ats-text truncate">{acct.name}</div>
                                <div className="text-[10px] text-ats-text-muted font-mono">{acct.platform_account_id}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {nbTestMessages[acct.id] && (
                                  <span className={`text-[10px] ${nbTestingAccounts[acct.id] === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {nbTestMessages[acct.id]}
                                  </span>
                                )}
                                {!nbTestMessages[acct.id] && acct.has_access_token && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="API key configured" />
                                )}
                                <button onClick={() => handleTestNbAccount(acct.id)} className="px-2 py-1 text-[10px] bg-ats-surface border border-ats-border rounded text-ats-text-muted hover:bg-ats-hover transition-colors">
                                  {nbTestingAccounts[acct.id] === 'testing' ? '...' : 'Test'}
                                </button>
                                <button onClick={() => handleRemoveNbAccount(acct.id)} className="px-2 py-1 text-[10px] text-red-400 border border-red-900/40 rounded hover:bg-red-900/20 transition-colors">
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add account form */}
                      {nbShowAddForm ? (
                        <div className="p-3 rounded-lg border border-ats-accent/30 bg-ats-accent/5 space-y-2">
                          <div className="text-[10px] text-ats-text-muted uppercase tracking-widest font-mono">Add NewsBreak Account</div>
                          <div>
                            <label className={labelCls}>Account Name</label>
                            <input type="text" value={nbNewName} onChange={e => setNbNewName(e.target.value)}
                              placeholder="e.g. Brand X NewsBreak" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>API Key</label>
                            <input type="password" value={nbNewApiKey} onChange={e => setNbNewApiKey(e.target.value)}
                              placeholder="Enter your NewsBreak API key" className={inputCls} />
                            <div className="text-[10px] text-ats-text-muted mt-0.5">From Ad Manager &gt; Resources &gt; API Access Tokens</div>
                          </div>
                          <div>
                            <label className={labelCls}>Advertiser / Account ID</label>
                            <input type="text" value={nbNewAccountId} onChange={e => setNbNewAccountId(e.target.value)}
                              placeholder="Your advertiser/account ID" className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleAddNbAccount}
                              disabled={nbAddingAccount || !nbNewName.trim() || !nbNewApiKey.trim() || !nbNewAccountId.trim()}
                              className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50">
                              {nbAddingAccount ? 'Adding...' : 'Add Account'}
                            </button>
                            <button onClick={() => { setNbShowAddForm(false); setNbNewName(''); setNbNewApiKey(''); setNbNewAccountId(''); }}
                              className="px-3 py-1.5 text-xs text-ats-text-muted hover:text-ats-text transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setNbShowAddForm(true)}
                          className="w-full px-3 py-2 border border-dashed border-ats-border rounded-lg text-xs text-ats-text-muted hover:border-ats-accent hover:text-ats-accent transition-colors">
                          + Add NewsBreak Account
                        </button>
                      )}

                      {/* Legacy single-account fallback (show if no multi-accounts AND legacy settings exist) */}
                      {nbAccounts.length === 0 && (settings.newsbreak_api_key || settings.newsbreak_account_id) && (
                        <div className="border-t border-ats-border pt-2 mt-2">
                          <div className="text-[10px] text-ats-text-muted mb-2">Legacy settings (migrate by adding as an account above)</div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleTestNB} className={btnSecondary}>
                              {nbTestStatus === 'testing' ? 'Testing...' : 'Test Legacy'}
                            </button>
                            {nbTestMessage && <span className={`text-xs ${nbTestStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{nbTestMessage}</span>}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Auto-saved indicator */}
                  <p className="text-[10px] text-ats-text-muted text-center mt-1">Changes are saved automatically</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Webhook Tokens — collapsible */}
      <div className="mt-4">
        <button onClick={() => setShowTokenSection(!showTokenSection)}
          className="flex items-center gap-2 text-xs font-semibold text-ats-text-muted mb-2 hover:text-ats-accent transition-colors">
          <span className={`transition-transform text-[10px] ${showTokenSection ? 'rotate-90' : ''}`}>&#9654;</span>
          Webhook Tokens
          {tokens.length > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded-full text-ats-text-muted font-mono">{tokens.length}</span>}
        </button>

        {showTokenSection && (
          <div className="bg-ats-card rounded-xl border border-ats-border p-3 sm:p-4">
            <p className="text-[11px] text-ats-text-muted mb-3">
              Generate user-scoped webhook tokens. Orders received via token-based URLs are automatically associated with your account.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <select value={newTokenSource} onChange={e => setNewTokenSource(e.target.value)}
                className={`${inputCls} sm:w-auto`}>
                <option value="checkout_champ">CheckoutChamp</option>
                <option value="shopify">Shopify</option>
              </select>
              <input type="text" value={newTokenLabel} onChange={e => setNewTokenLabel(e.target.value)}
                placeholder="Label (optional)" className={`${inputCls} flex-1`} />
              <button onClick={handleCreateToken} disabled={creatingToken}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 whitespace-nowrap">
                {creatingToken ? 'Creating...' : 'Generate'}
              </button>
            </div>

            {tokens.length === 0 ? (
              <div className="text-[11px] text-ats-text-muted text-center py-4 bg-ats-bg/50 rounded-lg">No tokens yet</div>
            ) : (
              <div className="space-y-2">
                {tokens.map(t => {
                  const route = t.source === 'shopify' ? 'shopify' : 'checkout-champ';
                  const url = `${webhookBaseUrl}/api/webhooks/${route}/${t.token}`;
                  return (
                    <div key={t.id} className={`p-2.5 rounded-lg border ${t.active ? 'border-ats-border bg-ats-bg/50' : 'border-ats-border/50 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-[11px] font-semibold text-ats-text uppercase">{t.source.replace('_', ' ')}</span>
                          {t.label && <span className="text-[11px] text-ats-text-muted">· {t.label}</span>}
                        </div>
                        {t.active && (
                          <button onClick={() => handleRevokeToken(t.id)} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">Revoke</button>
                        )}
                      </div>
                      {t.active && (
                        <div className="flex gap-1.5">
                          <input readOnly value={url} className="flex-1 min-w-0 px-2 py-1 bg-ats-bg border border-ats-border rounded text-[10px] font-mono text-ats-text-muted outline-none" />
                          <button onClick={() => copy(url)} className="px-2.5 py-1 bg-ats-surface border border-ats-border rounded text-[10px] text-ats-text-muted hover:bg-ats-hover transition-colors shrink-0">Copy</button>
                        </div>
                      )}
                      <div className="text-[9px] text-ats-text-muted mt-1 font-mono">
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
