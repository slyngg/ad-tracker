import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '../../stores/authStore';
import { getOAuthStatus, OAuthStatus } from '../../lib/api';
import OAuthConnectButton from '../../components/shared/OAuthConnectButton';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ── Integration status type ─────────────────────── */
interface IntegrationStatus {
  shopify: 'idle' | 'testing' | 'connected' | 'error';
  checkoutChamp: 'idle' | 'testing' | 'connected' | 'error';
  meta: 'idle' | 'testing' | 'connected' | 'error';
  google: 'idle' | 'testing' | 'connected' | 'error';
  tiktok: 'idle' | 'testing' | 'connected' | 'error';
  klaviyo: 'idle' | 'testing' | 'connected' | 'error';
}

/* ── Tour page definitions ───────────────────────── */
const TOUR_PAGES = [
  { title: 'Command Center', desc: 'Your real-time dashboard — spend, revenue, ROAS, profit, live orders all at a glance. Pin your most important KPIs.', path: '/summary', icon: '📊' },
  { title: 'Attribution', desc: 'See which campaigns drive revenue. Switch between Last Click, First Click, Linear, and Time Decay models. NC CPA, channel overlap.', path: '/acquisition/attribution', icon: '🎯' },
  { title: 'Creative Analytics', desc: 'Analyze ad creative performance across 8 dimensions. AI auto-tags your creatives, finds winning patterns, and suggests what to launch next.', path: '/creative/analytics', icon: '🎨' },
  { title: 'Customer Retention', desc: 'RFM segments (Whales, Loyal, Rookies, Lost), cohort retention heatmaps, LTV distribution, repeat purchase tracking.', path: '/customers/segments', icon: '👥' },
  { title: 'Website & GA4', desc: 'GA4 traffic, funnel drop-offs, site search queries, product journeys, bundle analysis — everything about your store conversion.', path: '/website/performance', icon: '🌐' },
  { title: 'AI Operator', desc: 'Ask anything about your data in natural language. The AI has 22 tools — query metrics, analyze creatives, generate reports, detect anomalies.', path: '/operator', icon: '🤖' },
  { title: 'AI Studio', desc: 'Build custom AI agents with specific tools and system prompts. Generate ad copy variations. Auto-generate performance reports.', path: '/ai/agents', icon: '🧠' },
  { title: 'Rules Engine', desc: 'Set automated alerts — get notified when ROAS drops, spend exceeds budget, or a campaign goes below break-even.', path: '/rules', icon: '⚡' },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();

  /* ── Phase: 'connect' | 'connected' | 'tour' ──── */
  const [phase, setPhase] = useState<'connect' | 'connected' | 'tour'>('connect');
  const [tourIdx, setTourIdx] = useState(0);

  /* ── Connection fields (manual fallback) ────────── */
  const [showManual, setShowManual] = useState<Record<string, boolean>>({});
  // Shopify
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStore, setShopifyStore] = useState('');
  // CheckoutChamp
  const [ccApiKey, setCcApiKey] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  // Meta
  const [fbToken, setFbToken] = useState('');
  const [fbAccounts, setFbAccounts] = useState('');
  const [fbTestMsg, setFbTestMsg] = useState('');
  // Google (GA4)
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4CredentialsJson, setGa4CredentialsJson] = useState('');

  const [status, setStatus] = useState<IntegrationStatus>({ shopify: 'idle', checkoutChamp: 'idle', meta: 'idle', google: 'idle', tiktok: 'idle', klaviyo: 'idle' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasAnyData, setHasAnyData] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const webhookBase = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks` : 'https://your-domain.com/api/webhooks';

  /* ── Load OAuth statuses ────────────────────────── */
  const loadOAuthStatuses = useCallback(async () => {
    try {
      const statuses = await getOAuthStatus();
      setStatus(prev => {
        const next = { ...prev };
        for (const s of statuses) {
          const key = s.platform as keyof IntegrationStatus;
          if (key in next && s.status === 'connected') {
            next[key] = 'connected';
          }
        }
        return next;
      });
      if (statuses.some(s => s.status === 'connected')) setHasAnyData(true);
    } catch {}
  }, []);

  /* ── Check existing connections on mount ────────── */
  useEffect(() => {
    (async () => {
      try {
        const [wh, fb] = await Promise.all([
          apiFetch<{ shopify: boolean; checkoutChamp: boolean }>('/onboarding/check-webhooks'),
          apiFetch<{ hasToken: boolean; connected: boolean }>('/onboarding/check-facebook'),
        ]);
        setStatus(prev => ({
          ...prev,
          shopify: wh.shopify ? 'connected' : 'idle',
          checkoutChamp: wh.checkoutChamp ? 'connected' : 'idle',
          meta: fb.connected ? 'connected' : fb.hasToken ? 'testing' : 'idle',
        }));
        if (wh.shopify || wh.checkoutChamp || fb.connected) setHasAnyData(true);
      } catch {}
      loadOAuthStatuses();
    })();
  }, [loadOAuthStatuses]);

  /* ── Poll for webhook data while on connect screen */
  useEffect(() => {
    if (phase !== 'connect') return;
    pollRef.current = setInterval(async () => {
      try {
        const wh = await apiFetch<{ shopify: boolean; checkoutChamp: boolean }>('/onboarding/check-webhooks');
        if (wh.shopify) setStatus(prev => ({ ...prev, shopify: 'connected' }));
        if (wh.checkoutChamp) setStatus(prev => ({ ...prev, checkoutChamp: 'connected' }));
        if (wh.shopify || wh.checkoutChamp) setHasAnyData(true);
      } catch {}
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase]);

  /* ── OAuth success handler ──────────────────────── */
  const handleOAuthSuccess = (platform: keyof IntegrationStatus) => {
    setStatus(prev => ({ ...prev, [platform]: 'connected' }));
    setHasAnyData(true);
    loadOAuthStatuses();
  };

  const handleOAuthError = (msg: string) => {
    setMessage({ type: 'error', text: msg });
  };

  /* ── Save all settings at once ─────────────────── */
  const saveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data: Record<string, string> = {};
      if (fbToken) data.fb_access_token = fbToken;
      if (fbAccounts) data.fb_ad_account_ids = fbAccounts;
      if (ccApiKey) data.cc_api_key = ccApiKey;
      if (ccApiUrl) data.cc_api_url = ccApiUrl;
      if (ccWebhookSecret) data.cc_webhook_secret = ccWebhookSecret;
      if (shopifySecret) data.shopify_webhook_secret = shopifySecret;
      if (shopifyStore) data.shopify_store_url = shopifyStore;
      if (ga4PropertyId) data.ga4_property_id = ga4PropertyId;
      if (ga4CredentialsJson) data.ga4_credentials_json = ga4CredentialsJson;

      if (Object.keys(data).length > 0) {
        await apiFetch('/settings', { method: 'POST', body: JSON.stringify(data) });
      }
      setMessage({ type: 'success', text: 'Saved!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    }
    setSaving(false);
  };

  /* ── Test individual connections ────────────────── */
  const testMeta = async () => {
    if (!fbToken && status.meta !== 'connected') return;
    setStatus(prev => ({ ...prev, meta: 'testing' }));
    setFbTestMsg('');
    try {
      if (fbToken) await apiFetch('/settings', { method: 'POST', body: JSON.stringify({ fb_access_token: fbToken, ...(fbAccounts ? { fb_ad_account_ids: fbAccounts } : {}) }) });
      const r = await apiFetch<{ success: boolean; error?: string; account_name?: string }>('/settings/test/facebook', { method: 'POST' });
      if (r.success) { setStatus(prev => ({ ...prev, meta: 'connected' })); setFbTestMsg(r.account_name || 'Connected'); setHasAnyData(true); }
      else { setStatus(prev => ({ ...prev, meta: 'error' })); setFbTestMsg(r.error || 'Failed'); }
    } catch { setStatus(prev => ({ ...prev, meta: 'error' })); setFbTestMsg('Connection failed'); }
  };

  const testCC = async () => {
    setStatus(prev => ({ ...prev, checkoutChamp: 'testing' }));
    try {
      if (ccApiKey) await apiFetch('/settings', { method: 'POST', body: JSON.stringify({ cc_api_key: ccApiKey, ...(ccApiUrl ? { cc_api_url: ccApiUrl } : {}), ...(ccWebhookSecret ? { cc_webhook_secret: ccWebhookSecret } : {}) }) });
      const r = await apiFetch<{ success: boolean; error?: string }>('/settings/test/checkout-champ', { method: 'POST' });
      if (r.success) { setStatus(prev => ({ ...prev, checkoutChamp: 'connected' })); setHasAnyData(true); }
      else { setStatus(prev => ({ ...prev, checkoutChamp: 'error' })); }
    } catch { setStatus(prev => ({ ...prev, checkoutChamp: 'error' })); }
  };

  const testGA4 = async () => {
    if (!ga4PropertyId) return;
    setStatus(prev => ({ ...prev, google: 'testing' }));
    try {
      await apiFetch('/settings', { method: 'POST', body: JSON.stringify({ ga4_property_id: ga4PropertyId, ...(ga4CredentialsJson ? { ga4_credentials_json: ga4CredentialsJson } : {}) }) });
      const r = await apiFetch<{ success?: boolean }>('/ga4/test', { method: 'POST' });
      setStatus(prev => ({ ...prev, google: r.success ? 'connected' : 'error' }));
      if (r.success) setHasAnyData(true);
    } catch { setStatus(prev => ({ ...prev, google: 'error' })); }
  };

  /* ── Go live ───────────────────────────────────── */
  const goLive = async () => {
    await saveAll();
    await apiFetch('/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 'connect_store', completed: true }) }).catch(() => {});
    await apiFetch('/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 'connect_ads', completed: true }) }).catch(() => {});
    setPhase('connected');
  };

  const finishOnboarding = async () => {
    await apiFetch('/onboarding/complete', { method: 'POST' }).catch(() => {});
    navigate('/summary');
  };

  const startTour = () => { setTourIdx(0); setPhase('tour'); };

  const enableDemo = async () => {
    setDemoLoading(true);
    try { await apiFetch('/onboarding/demo-mode', { method: 'POST', body: JSON.stringify({ enabled: true }) }); } catch {}
    await apiFetch('/onboarding/complete', { method: 'POST' }).catch(() => {});
    navigate('/summary');
  };

  const copyUrl = (text: string) => { navigator.clipboard.writeText(text); setMessage({ type: 'success', text: 'Copied!' }); setTimeout(() => setMessage(null), 1500); };

  const connectedCount = Object.values(status).filter(s => s === 'connected').length;
  const totalPlatforms = Object.keys(status).length;
  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-lg px-4 py-3 text-sm text-ats-text font-mono focus:outline-none focus:border-ats-accent transition-colors';
  const labelCls = 'text-[10px] text-ats-text-muted uppercase tracking-widest font-mono mb-1 block';
  const statusDot = (s: IntegrationStatus[keyof IntegrationStatus]) =>
    s === 'connected' ? 'bg-emerald-500' : s === 'testing' ? 'bg-amber-500 animate-pulse' : s === 'error' ? 'bg-red-500' : 'bg-gray-600';
  const statusLabel = (s: IntegrationStatus[keyof IntegrationStatus]) =>
    s === 'connected' ? 'Connected' : s === 'testing' ? 'Testing...' : s === 'error' ? 'Error' : 'Not connected';

  /* ════════════════════════════════════════════════ */
  /* PHASE 1: CONNECT THE BLOOD                       */
  /* ════════════════════════════════════════════════ */
  if (phase === 'connect') return (
    <div className="bg-ats-bg min-h-screen">
      <div className="max-w-3xl mx-auto px-3 py-6 sm:px-4 sm:py-8">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-ats-text mb-2">Connect Your Data Sources</h1>
          <p className="text-xs sm:text-sm text-ats-text-muted max-w-md mx-auto">
            Hook up your store and ad platforms so data starts flowing immediately. Click Connect for one-click setup, or enter credentials manually.
          </p>
        </div>

        {/* Connection status bar */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {(['meta', 'google', 'shopify', 'tiktok', 'klaviyo', 'checkoutChamp'] as const).map(k => (
              <div key={k} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusDot(status[k])}`} />
                <span className="text-xs text-ats-text-muted capitalize">{k === 'checkoutChamp' ? 'CC' : k}</span>
              </div>
            ))}
          </div>
          <span className="text-xs font-mono text-ats-text-muted">{connectedCount}/{totalPlatforms} connected</span>
        </div>

        {message && <div className={`px-3 py-2 mb-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>{message.text}</div>}

        {/* ── Meta / Facebook Ads (OAuth primary) ───── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔷</span>
              <h3 className="text-sm font-bold text-ats-text">Meta / Facebook Ads</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.meta)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.meta)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Connect to pull ad spend, ROAS, creative performance, and attribution data.</p>
          {status.meta !== 'connected' && (
            <>
              <OAuthConnectButton platform="meta" onSuccess={() => handleOAuthSuccess('meta')} onError={handleOAuthError} />
              <button onClick={() => setShowManual(p => ({ ...p, meta: !p.meta }))} className="ml-3 text-[11px] text-ats-text-muted hover:text-ats-text transition-colors">
                {showManual.meta ? 'Hide manual' : 'Or enter manually'}
              </button>
              {showManual.meta && (
                <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
                  <div><label className={labelCls}>Access Token</label><input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)} placeholder="EAAxxxxxxxx..." className={inputCls} /></div>
                  <div><label className={labelCls}>Ad Account IDs (comma-separated)</label><input value={fbAccounts} onChange={e => setFbAccounts(e.target.value)} placeholder="act_123456789, act_987654321" className={inputCls} /></div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                    <button onClick={testMeta} disabled={!fbToken} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test Connection</button>
                    {fbTestMsg && <span className={`text-xs ${fbTestMsg.toLowerCase().includes('fail') || fbTestMsg.toLowerCase().includes('error') ? 'text-red-400' : 'text-emerald-400'}`}>{fbTestMsg}</span>}
                  </div>
                </div>
              )}
            </>
          )}
          {status.meta === 'connected' && <div className="text-xs text-emerald-400 font-mono">Connected via {status.meta === 'connected' ? 'OAuth' : 'manual'}</div>}
        </div>

        {/* ── Google / GA4 (OAuth primary) ────────── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔴</span>
              <h3 className="text-sm font-bold text-ats-text">Google Analytics 4</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.google)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.google)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Connect for traffic analytics, funnel analysis, and conversion data.</p>
          {status.google !== 'connected' && (
            <>
              <OAuthConnectButton platform="google" onSuccess={() => handleOAuthSuccess('google')} onError={handleOAuthError} />
              <button onClick={() => setShowManual(p => ({ ...p, google: !p.google }))} className="ml-3 text-[11px] text-ats-text-muted hover:text-ats-text transition-colors">
                {showManual.google ? 'Hide manual' : 'Or enter manually'}
              </button>
              {showManual.google && (
                <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
                  <div><label className={labelCls}>GA4 Property ID</label><input value={ga4PropertyId} onChange={e => setGa4PropertyId(e.target.value)} placeholder="properties/123456789" className={inputCls} /></div>
                  <div><label className={labelCls}>Service Account JSON (paste credentials)</label><textarea rows={3} value={ga4CredentialsJson} onChange={e => setGa4CredentialsJson(e.target.value)} placeholder='{"type":"service_account","project_id":"..."}' className={`${inputCls} resize-none`} /></div>
                  <button onClick={testGA4} disabled={!ga4PropertyId} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test GA4 Connection</button>
                </div>
              )}
            </>
          )}
          {status.google === 'connected' && <div className="text-xs text-emerald-400 font-mono">Connected</div>}
        </div>

        {/* ── Shopify (OAuth primary) ────────────── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🟢</span>
              <h3 className="text-sm font-bold text-ats-text">Shopify</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.shopify)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.shopify)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Connect for order data, product insights, and webhook-based real-time updates.</p>
          {status.shopify !== 'connected' && (
            <>
              <div className="mb-3">
                <label className={labelCls}>Store URL (required)</label>
                <input value={shopifyStore} onChange={e => setShopifyStore(e.target.value)} placeholder="mystore.myshopify.com" className={inputCls} />
              </div>
              <OAuthConnectButton platform="shopify" storeUrl={shopifyStore} onSuccess={() => handleOAuthSuccess('shopify')} onError={handleOAuthError} />
              <button onClick={() => setShowManual(p => ({ ...p, shopify: !p.shopify }))} className="ml-3 text-[11px] text-ats-text-muted hover:text-ats-text transition-colors">
                {showManual.shopify ? 'Hide manual' : 'Or enter manually'}
              </button>
              {showManual.shopify && (
                <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
                  <p className="text-xs text-ats-text-muted">Add this webhook URL in Shopify Admin → Settings → Notifications → Webhooks (Order creation)</p>
                  <div className="flex gap-2">
                    <input readOnly value={`${webhookBase}/shopify/YOUR_TOKEN`} className={`${inputCls} text-ats-accent flex-1 min-w-0`} />
                    <button onClick={() => copyUrl(`${webhookBase}/shopify/YOUR_TOKEN`)} className="px-3 sm:px-4 py-3 bg-ats-accent text-white rounded-lg text-xs font-semibold shrink-0">Copy</button>
                  </div>
                  <div><label className={labelCls}>Webhook Secret</label><input type="password" value={shopifySecret} onChange={e => setShopifySecret(e.target.value)} placeholder="shpss_..." className={inputCls} /></div>
                </div>
              )}
            </>
          )}
          {status.shopify === 'connected' && <div className="text-xs text-emerald-400 font-mono">Connected</div>}
        </div>

        {/* ── TikTok Ads (OAuth only) ────────────── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎵</span>
              <h3 className="text-sm font-bold text-ats-text">TikTok Ads</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.tiktok)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.tiktok)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Connect for TikTok campaign performance and spend data.</p>
          {status.tiktok !== 'connected' ? (
            <OAuthConnectButton platform="tiktok" onSuccess={() => handleOAuthSuccess('tiktok')} onError={handleOAuthError} />
          ) : (
            <div className="text-xs text-emerald-400 font-mono">Connected</div>
          )}
        </div>

        {/* ── Klaviyo (OAuth only) ───────────────── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💜</span>
              <h3 className="text-sm font-bold text-ats-text">Klaviyo</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.klaviyo)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.klaviyo)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Connect for email list metrics, campaign performance, and customer profiles.</p>
          {status.klaviyo !== 'connected' ? (
            <OAuthConnectButton platform="klaviyo" onSuccess={() => handleOAuthSuccess('klaviyo')} onError={handleOAuthError} />
          ) : (
            <div className="text-xs text-emerald-400 font-mono">Connected</div>
          )}
        </div>

        {/* ── CheckoutChamp (manual only) ────────── */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔵</span>
              <h3 className="text-sm font-bold text-ats-text">CheckoutChamp</h3>
            </div>
            <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${statusDot(status.checkoutChamp)}`} /><span className="text-[10px] text-ats-text-muted font-mono">{statusLabel(status.checkoutChamp)}</span></div>
          </div>
          <p className="text-xs text-ats-text-muted mb-3">Add the webhook URL as a postback in your CC campaign settings, or enter API credentials for polling.</p>
          <div className="flex gap-2 mb-3">
            <input readOnly value={`${webhookBase}/checkout-champ/YOUR_TOKEN`} className={`${inputCls} text-ats-accent flex-1 min-w-0`} />
            <button onClick={() => copyUrl(`${webhookBase}/checkout-champ/YOUR_TOKEN`)} className="px-3 sm:px-4 py-3 bg-ats-accent text-white rounded-lg text-xs font-semibold shrink-0">Copy</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className={labelCls}>API Key</label><input type="password" value={ccApiKey} onChange={e => setCcApiKey(e.target.value)} placeholder="cc_api_..." className={inputCls} /></div>
            <div><label className={labelCls}>API Base URL</label><input value={ccApiUrl} onChange={e => setCcApiUrl(e.target.value)} placeholder="https://api.checkoutchamp.com/v1" className={inputCls} /></div>
          </div>
          <div className="mb-3"><label className={labelCls}>Webhook Secret</label><input type="password" value={ccWebhookSecret} onChange={e => setCcWebhookSecret(e.target.value)} placeholder="whsec_..." className={inputCls} /></div>
          <button onClick={testCC} disabled={!ccApiKey && status.checkoutChamp !== 'connected'} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test API Connection</button>
        </div>

        {/* ── Action buttons ───────────────────────── */}
        <div className="space-y-3">
          <button onClick={goLive} className="w-full py-4 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-ats-accent/20 active:scale-[0.98]">
            {connectedCount > 0 ? `Save & Go Live (${connectedCount} connected)` : 'Save & Continue'}
          </button>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6">
            <button onClick={enableDemo} disabled={demoLoading} className="text-sm text-ats-text-muted hover:text-ats-accent transition-colors py-1">
              {demoLoading ? 'Loading demo...' : 'Explore with demo data instead'}
            </button>
            <button onClick={finishOnboarding} className="text-sm text-ats-text-muted hover:text-ats-text transition-colors py-1">
              Skip everything
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════ */
  /* PHASE 2: CONNECTED — CHOOSE TOUR OR SKIP        */
  /* ════════════════════════════════════════════════ */
  if (phase === 'connected') return (
    <div className="bg-ats-bg min-h-screen flex items-center justify-center px-3 py-8 sm:p-4">
      <div className="w-full max-w-lg text-center">
        <div className="text-5xl sm:text-6xl mb-4 sm:mb-6">🔌</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-ats-text mb-2">You're Connected!</h1>
        <p className="text-xs sm:text-sm text-ats-text-muted mb-2 max-w-sm mx-auto">
          Data will start flowing within minutes. Your dashboard is ready to use.
        </p>

        {/* Connected summary */}
        <div className="bg-ats-card border border-ats-border rounded-xl p-3 sm:p-4 mb-6 sm:mb-8 flex flex-wrap justify-center gap-3 sm:gap-4 mx-auto">
          {(['meta', 'google', 'shopify', 'tiktok', 'klaviyo', 'checkoutChamp'] as const).map(k => (
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${statusDot(status[k])}`} />
              <span className={`text-xs font-mono ${status[k] === 'connected' ? 'text-emerald-400' : 'text-ats-text-muted'}`}>
                {k === 'checkoutChamp' ? 'CC' : k.charAt(0).toUpperCase() + k.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-3 max-w-sm mx-auto">
          <button onClick={finishOnboarding} className="w-full py-4 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-ats-accent/20 active:scale-[0.98]">
            Go to Dashboard
          </button>
          <button onClick={startTour} className="w-full py-3 bg-ats-card border border-ats-border text-ats-text rounded-xl text-sm font-semibold hover:bg-ats-hover transition-colors active:scale-[0.98]">
            Take a Quick Tour ({TOUR_PAGES.length} pages, ~2 min)
          </button>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════ */
  /* PHASE 3: OPTIONAL GUIDED TOUR                    */
  /* ════════════════════════════════════════════════ */
  const page = TOUR_PAGES[tourIdx];
  const isLast = tourIdx === TOUR_PAGES.length - 1;

  return (
    <div className="bg-ats-bg min-h-screen flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="flex gap-0.5 sm:gap-1 mb-4 sm:mb-6">
          {TOUR_PAGES.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= tourIdx ? 'bg-ats-accent' : 'bg-gray-700'}`} />
          ))}
        </div>

        <div className="bg-ats-card border border-ats-border rounded-2xl p-5 sm:p-8 shadow-xl">
          <div className="text-center mb-6">
            <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{page.icon}</div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono tracking-widest mb-2">{tourIdx + 1} of {TOUR_PAGES.length}</div>
            <h2 className="text-xl sm:text-2xl font-bold text-ats-text mb-2">{page.title}</h2>
            <p className="text-xs sm:text-sm text-ats-text-muted leading-relaxed max-w-sm mx-auto">{page.desc}</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <button
              onClick={() => tourIdx > 0 ? setTourIdx(tourIdx - 1) : setPhase('connected')}
              className="px-5 py-3 text-sm text-ats-text-muted hover:text-ats-text transition-colors rounded-lg hover:bg-ats-surface text-center sm:text-left"
            >
              {tourIdx > 0 ? 'Back' : 'Exit'}
            </button>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {isLast ? (
                <button onClick={finishOnboarding} className="w-full sm:w-auto px-6 py-3 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-ats-accent/20 active:scale-[0.98]">
                  Go to Dashboard
                </button>
              ) : (
                <button onClick={() => setTourIdx(tourIdx + 1)} className="w-full sm:w-auto px-6 py-3 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors active:scale-[0.98]">
                  Next
                </button>
              )}
              <button onClick={finishOnboarding} className="text-xs sm:text-sm text-ats-text-muted hover:text-ats-text transition-colors py-1">
                Skip to Dashboard
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => { finishOnboarding(); setTimeout(() => navigate(page.path), 100); }}
          className="mt-3 sm:mt-4 text-xs text-ats-accent hover:underline block text-center w-full py-2"
        >
          Open {page.title} now →
        </button>
      </div>
    </div>
  );
}
