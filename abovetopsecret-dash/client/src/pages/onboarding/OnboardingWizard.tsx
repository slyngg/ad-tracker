import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken, useAuthStore } from '../../stores/authStore';
import { getOAuthStatus, fetchAccounts, Account, createClient, createBrandConfig, updateAccount, Client, BrandConfig } from '../../lib/api';
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
  newsbreak: 'idle' | 'testing' | 'connected' | 'error';
  klaviyo: 'idle' | 'testing' | 'connected' | 'error';
}

/* ── Platform definitions ────────────────────────── */
const PLATFORMS: {
  key: keyof IntegrationStatus;
  name: string;
  icon: string;
  description: string;
  oauth: boolean;
  manualType?: 'meta' | 'google' | 'shopify' | 'checkoutChamp';
  requiresStoreUrl?: boolean;
}[] = [
  { key: 'meta', name: 'Meta / Facebook Ads', icon: 'f', description: 'Ad spend, ROAS & creative performance', oauth: true, manualType: 'meta' },
  { key: 'google', name: 'Google Analytics 4', icon: 'G', description: 'Traffic analytics & conversion data', oauth: true, manualType: 'google' },
  { key: 'shopify', name: 'Shopify', icon: 'S', description: 'Orders, products & real-time webhooks', oauth: true, manualType: 'shopify', requiresStoreUrl: true },
  { key: 'tiktok', name: 'TikTok Ads', icon: 'T', description: 'Campaign performance & spend data', oauth: true },
  { key: 'klaviyo', name: 'Klaviyo', icon: 'K', description: 'Email metrics & customer profiles', oauth: true },
  { key: 'newsbreak', name: 'NewsBreak Ads', icon: 'N', description: 'Campaign performance & spend data', oauth: true },
  { key: 'checkoutChamp', name: 'CheckoutChamp', icon: 'C', description: 'Order data via API or webhooks', oauth: false, manualType: 'checkoutChamp' },
];

const ICON_BG: Record<string, string> = {
  meta: 'bg-blue-600', google: 'bg-red-600', shopify: 'bg-green-600',
  tiktok: 'bg-pink-600', klaviyo: 'bg-purple-600', newsbreak: 'bg-orange-600', checkoutChamp: 'bg-indigo-600',
};

/* ── Platform color for account chips ─────────────── */
const PLATFORM_COLOR: Record<string, string> = {
  facebook: 'bg-blue-600', meta: 'bg-blue-600', google: 'bg-red-600',
  shopify: 'bg-green-600', tiktok: 'bg-pink-600', klaviyo: 'bg-purple-600',
  newsbreak: 'bg-orange-600', checkoutchamp: 'bg-indigo-600',
};

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const markComplete = useAuthStore(s => s.markOnboardingComplete);

  /* ── Step management ────────────────────────────── */
  const [currentStep, setCurrentStep] = useState(1);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left');

  /* ── Connection fields (manual fallback) ────────── */
  const [showManual, setShowManual] = useState<Record<string, boolean>>({});
  const [shopifySecret, setShopifySecret] = useState('');
  const [shopifyStore, setShopifyStore] = useState('');
  const [ccLoginId, setCcLoginId] = useState('');
  const [ccPassword, setCcPassword] = useState('');
  const [ccApiUrl, setCcApiUrl] = useState('');
  const [ccWebhookSecret, setCcWebhookSecret] = useState('');
  const [fbToken, setFbToken] = useState('');
  const [fbAccounts, setFbAccounts] = useState('');
  const [fbTestMsg, setFbTestMsg] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4CredentialsJson, setGa4CredentialsJson] = useState('');

  const [status, setStatus] = useState<IntegrationStatus>({ shopify: 'idle', checkoutChamp: 'idle', meta: 'idle', google: 'idle', tiktok: 'idle', newsbreak: 'idle', klaviyo: 'idle' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Step 2: Organize brands state ──────────────── */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<BrandConfig[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addingBrandForClient, setAddingBrandForClient] = useState<number | null>(null);
  const [addingBrand, setAddingBrand] = useState(false);
  const [assigningAccount, setAssigningAccount] = useState<number | null>(null);
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [showNextTooltip, setShowNextTooltip] = useState(false);
  const nextTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newClientInputRef = useRef<HTMLInputElement>(null);
  const newBrandInputRef = useRef<HTMLInputElement>(null);

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
      } catch {}
      loadOAuthStatuses();
    })();
  }, [loadOAuthStatuses]);

  /* ── Poll for webhook data ─────────────────────── */
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const wh = await apiFetch<{ shopify: boolean; checkoutChamp: boolean }>('/onboarding/check-webhooks');
        if (wh.shopify) setStatus(prev => ({ ...prev, shopify: 'connected' }));
        if (wh.checkoutChamp) setStatus(prev => ({ ...prev, checkoutChamp: 'connected' }));
      } catch {}
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); if (nextTooltipTimer.current) clearTimeout(nextTooltipTimer.current); };
  }, []);

  /* ── OAuth handlers ──────────────────────────────── */
  const handleOAuthSuccess = (platform: keyof IntegrationStatus) => {
    setStatus(prev => ({ ...prev, [platform]: 'connected' }));
    loadOAuthStatuses();
  };

  const handleOAuthError = (msg: string) => {
    setMessage({ type: 'error', text: msg });
    setTimeout(() => setMessage(null), 4000);
  };

  /* ── Save all settings at once ─────────────────── */
  const saveAll = async () => {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      if (fbToken) data.fb_access_token = fbToken;
      if (fbAccounts) data.fb_ad_account_ids = fbAccounts;
      if (ccLoginId) data.cc_login_id = ccLoginId;
      if (ccPassword) data.cc_password = ccPassword;
      if (ccApiUrl) data.cc_api_url = ccApiUrl;
      if (ccWebhookSecret) data.cc_webhook_secret = ccWebhookSecret;
      if (shopifySecret) data.shopify_webhook_secret = shopifySecret;
      if (shopifyStore) data.shopify_store_url = shopifyStore;
      if (ga4PropertyId) data.ga4_property_id = ga4PropertyId;
      if (ga4CredentialsJson) data.ga4_credentials_json = ga4CredentialsJson;

      if (Object.keys(data).length > 0) {
        await apiFetch('/settings', { method: 'POST', body: JSON.stringify(data) });
      }
    } catch {}
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
      if (r.success) { setStatus(prev => ({ ...prev, meta: 'connected' })); setFbTestMsg(r.account_name || 'Connected'); }
      else { setStatus(prev => ({ ...prev, meta: 'error' })); setFbTestMsg(r.error || 'Failed'); }
    } catch { setStatus(prev => ({ ...prev, meta: 'error' })); setFbTestMsg('Connection failed'); }
  };

  const testCC = async () => {
    setStatus(prev => ({ ...prev, checkoutChamp: 'testing' }));
    try {
      if (ccLoginId) await apiFetch('/settings', { method: 'POST', body: JSON.stringify({ cc_login_id: ccLoginId, ...(ccPassword ? { cc_password: ccPassword } : {}), ...(ccApiUrl ? { cc_api_url: ccApiUrl } : {}), ...(ccWebhookSecret ? { cc_webhook_secret: ccWebhookSecret } : {}) }) });
      const r = await apiFetch<{ success: boolean; error?: string }>('/settings/test/checkout-champ', { method: 'POST' });
      if (r.success) { setStatus(prev => ({ ...prev, checkoutChamp: 'connected' })); }
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
    } catch { setStatus(prev => ({ ...prev, google: 'error' })); }
  };

  /* ── Step transitions ──────────────────────────── */
  const goToStep2 = async () => {
    setSaving(true);
    await saveAll();
    await apiFetch('/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 'connect_store', completed: true }) }).catch(() => {});
    await apiFetch('/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 'connect_ads', completed: true }) }).catch(() => {});
    // Load accounts for step 2
    try {
      const [accts, cls, bcs] = await Promise.all([
        fetchAccounts(),
        apiFetch<Client[]>('/clients'),
        apiFetch<BrandConfig[]>('/brand-configs'),
      ]);
      setAccounts(accts);
      setClients(cls);
      setBrands(bcs);
    } catch {}
    setSaving(false);
    setSlideDir('left');
    setCurrentStep(2);
  };

  /* ── Go live — final action ───────────────────── */
  const goLive = async () => {
    setSaving(true);
    await apiFetch('/onboarding/complete', { method: 'POST' }).catch(() => {});
    markComplete();
    setSaving(false);
    navigate('/summary');
  };

  /* ── Step 2: Client CRUD ───────────────────────── */
  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    setAddingClient(true);
    try {
      const c = await createClient({ name: newClientName.trim() });
      setClients(prev => [...prev, c]);
      setNewClientName('');
      setShowAddClient(false);
      setExpandedClient(c.id);
      // Auto-open "add brand" for the new client
      setAddingBrandForClient(c.id);
      setTimeout(() => newBrandInputRef.current?.focus(), 150);
    } catch {
      setMessage({ type: 'error', text: 'Failed to create client' });
      setTimeout(() => setMessage(null), 3000);
    }
    setAddingClient(false);
  };

  const handleAddBrand = async (clientId: number) => {
    if (!newBrandName.trim()) return;
    setAddingBrand(true);
    try {
      const b = await createBrandConfig({ name: newBrandName.trim(), client_id: clientId });
      setBrands(prev => [...prev, b]);
      setNewBrandName('');
      setAddingBrandForClient(null);
    } catch {
      setMessage({ type: 'error', text: 'Failed to create brand' });
      setTimeout(() => setMessage(null), 3000);
    }
    setAddingBrand(false);
  };

  const handleAssignAccount = async (accountId: number, brandConfigId: number) => {
    setAssigningAccount(accountId);
    try {
      await updateAccount(accountId, { brand_config_id: brandConfigId });
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, brand_config_id: brandConfigId } : a));
    } catch {
      setMessage({ type: 'error', text: 'Failed to assign account' });
      setTimeout(() => setMessage(null), 3000);
    }
    setAssigningAccount(null);
  };

  const handleUnassignAccount = async (accountId: number) => {
    setAssigningAccount(accountId);
    try {
      await updateAccount(accountId, { brand_config_id: null });
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, brand_config_id: null } : a));
    } catch {}
    setAssigningAccount(null);
  };

  const copyUrl = (text: string) => { navigator.clipboard.writeText(text); setMessage({ type: 'success', text: 'Copied!' }); setTimeout(() => setMessage(null), 1500); };

  const connectedCount = Object.values(status).filter(s => s === 'connected').length;
  const canContinue = connectedCount > 0;

  const statusDotCls = (s: IntegrationStatus[keyof IntegrationStatus]) =>
    s === 'connected' ? 'bg-emerald-500' : s === 'testing' ? 'bg-amber-500 animate-pulse' : s === 'error' ? 'bg-red-500' : 'bg-ats-text-muted/40';

  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-lg px-4 py-3 text-sm text-ats-text font-mono focus:outline-none focus:border-ats-accent transition-colors';
  const labelCls = 'text-[10px] text-ats-text-muted uppercase tracking-widest font-mono mb-1 block';

  /* ── Render manual fields for a platform ────────── */
  const renderManualFields = (platformKey: keyof IntegrationStatus) => {
    if (platformKey === 'meta') return (
      <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
        <div><label className={labelCls}>Access Token</label><input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)} placeholder="EAAxxxxxxxx..." className={inputCls} /></div>
        <div><label className={labelCls}>Ad Account IDs (comma-separated)</label><input value={fbAccounts} onChange={e => setFbAccounts(e.target.value)} placeholder="act_123456789, act_987654321" className={inputCls} /></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <button onClick={testMeta} disabled={!fbToken} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test Connection</button>
          {fbTestMsg && <span className={`text-xs ${fbTestMsg.toLowerCase().includes('fail') || fbTestMsg.toLowerCase().includes('error') ? 'text-red-400' : 'text-emerald-400'}`}>{fbTestMsg}</span>}
        </div>
      </div>
    );
    if (platformKey === 'google') return (
      <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
        <div><label className={labelCls}>GA4 Property ID</label><input value={ga4PropertyId} onChange={e => setGa4PropertyId(e.target.value)} placeholder="properties/123456789" className={inputCls} /></div>
        <div><label className={labelCls}>Service Account JSON (paste credentials)</label><textarea rows={3} value={ga4CredentialsJson} onChange={e => setGa4CredentialsJson(e.target.value)} placeholder='{"type":"service_account","project_id":"..."}' className={`${inputCls} resize-none`} /></div>
        <button onClick={testGA4} disabled={!ga4PropertyId} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test GA4 Connection</button>
      </div>
    );
    if (platformKey === 'shopify') return (
      <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
        <p className="text-xs text-ats-text-muted">Add this webhook URL in Shopify Admin &rarr; Settings &rarr; Notifications &rarr; Webhooks (Order creation)</p>
        <div className="flex gap-2">
          <input readOnly value={`${webhookBase}/shopify/YOUR_TOKEN`} className={`${inputCls} text-ats-accent flex-1 min-w-0`} />
          <button onClick={() => copyUrl(`${webhookBase}/shopify/YOUR_TOKEN`)} className="px-3 sm:px-4 py-3 bg-ats-accent text-white rounded-lg text-xs font-semibold shrink-0">Copy</button>
        </div>
        <div><label className={labelCls}>Webhook Secret</label><input type="password" value={shopifySecret} onChange={e => setShopifySecret(e.target.value)} placeholder="shpss_..." className={inputCls} /></div>
      </div>
    );
    if (platformKey === 'checkoutChamp') return (
      <div className="space-y-3 mt-3 pt-3 border-t border-ats-border">
        <div className="flex gap-2">
          <input readOnly value={`${webhookBase}/checkout-champ/YOUR_TOKEN`} className={`${inputCls} text-ats-accent flex-1 min-w-0`} />
          <button onClick={() => copyUrl(`${webhookBase}/checkout-champ/YOUR_TOKEN`)} className="px-3 sm:px-4 py-3 bg-ats-accent text-white rounded-lg text-xs font-semibold shrink-0">Copy</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Login ID</label><input type="text" value={ccLoginId} onChange={e => setCcLoginId(e.target.value)} placeholder="API user login ID" className={inputCls} /></div>
          <div><label className={labelCls}>Password</label><input type="password" value={ccPassword} onChange={e => setCcPassword(e.target.value)} placeholder="API user password" className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>API Base URL</label><input value={ccApiUrl} onChange={e => setCcApiUrl(e.target.value)} placeholder="https://api.checkoutchamp.com" className={inputCls} /></div>
          <div><label className={labelCls}>Webhook Secret</label><input type="password" value={ccWebhookSecret} onChange={e => setCcWebhookSecret(e.target.value)} placeholder="whsec_..." className={inputCls} /></div>
        </div>
        <button onClick={testCC} disabled={!ccLoginId && status.checkoutChamp !== 'connected'} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-ats-surface border border-ats-border rounded-lg text-xs text-ats-text font-semibold disabled:opacity-40 hover:bg-ats-hover transition-colors">Test API Connection</button>
      </div>
    );
    return null;
  };

  /* ── Helper: accounts for a brand ──────────────── */
  const accountsForBrand = (brandId: number) => accounts.filter(a => a.brand_config_id === brandId);
  const unassignedAccounts = accounts.filter(a => !a.brand_config_id);
  const brandsForClient = (clientId: number) => brands.filter(b => b.client_id === clientId);

  return (
    <div className="bg-ats-bg min-h-screen min-h-[100dvh] flex flex-col overflow-hidden">
      {/* ── Toast ─────────────────────────────────── */}
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl backdrop-blur-sm ${
          message.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── Progress dots ──────────────────────────── */}
      <div className="flex items-center justify-center gap-2 pt-5 pb-2 px-4">
        <button
          onClick={() => { if (currentStep > 1) { setSlideDir('right'); setCurrentStep(1); } }}
          className={`h-1.5 rounded-full transition-all duration-500 ${currentStep === 1 ? 'w-8 bg-ats-accent' : 'w-1.5 bg-ats-border cursor-pointer hover:bg-ats-text-muted'}`}
        />
        <div className={`h-1.5 rounded-full transition-all duration-500 ${currentStep === 2 ? 'w-8 bg-ats-accent' : 'w-1.5 bg-ats-border'}`} />
      </div>

      {/* ── Sliding container ─────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Step 1: Connect Data */}
        <div
          className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-y-auto"
          style={{ transform: currentStep === 1 ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <div className="pb-28">
            <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-10">

              {/* Header */}
              <div className="text-center mb-6 sm:mb-10">
                <div className="inline-flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-ats-accent flex items-center justify-center">
                    <span className="text-white text-sm font-bold">O</span>
                  </div>
                  <span className="text-sm font-bold text-ats-text tracking-wide">OpticData</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold text-ats-text mb-2">Connect Your Data</h1>
                <p className="text-sm sm:text-base text-ats-text-muted max-w-lg mx-auto leading-relaxed">
                  Secure, read-only access. We never modify your campaigns or ads.
                </p>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-5 mb-6 sm:mb-10">
                {[
                  { icon: '\u{1F512}', label: 'Read-only access' },
                  { icon: '\u{1F510}', label: '256-bit encryption' },
                  { icon: '\u{26A1}', label: '2-min setup' },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-card border border-ats-border rounded-full">
                    <span className="text-xs">{b.icon}</span>
                    <span className="text-[11px] text-ats-text-muted font-medium">{b.label}</span>
                  </div>
                ))}
              </div>

              {/* Platform grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {PLATFORMS.map(p => {
                  const s = status[p.key];
                  const isConnected = s === 'connected';
                  const isTesting = s === 'testing';
                  const isManualOpen = showManual[p.key] || false;

                  return (
                    <div
                      key={p.key}
                      className={`bg-ats-card border rounded-xl p-4 sm:p-5 transition-all ${
                        isConnected ? 'border-emerald-800/40 ring-1 ring-emerald-800/20' : 'border-ats-border'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0 ${ICON_BG[p.key]}`}>
                            {p.icon}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-ats-text">{p.name}</h3>
                            <p className="text-[11px] text-ats-text-muted leading-snug mt-0.5">{p.description}</p>
                          </div>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${statusDotCls(s)}`} />
                      </div>

                      {isConnected && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-xs font-semibold text-emerald-400">Connected</span>
                        </div>
                      )}

                      {!isConnected && (
                        <div className="mt-2">
                          {p.requiresStoreUrl && (
                            <div className="mb-3">
                              <label className={labelCls}>Store URL</label>
                              <input value={shopifyStore} onChange={e => setShopifyStore(e.target.value)} placeholder="mystore.myshopify.com" className={inputCls} />
                            </div>
                          )}

                          {p.oauth && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <OAuthConnectButton
                                platform={p.key}
                                storeUrl={p.requiresStoreUrl ? shopifyStore : undefined}
                                onSuccess={() => handleOAuthSuccess(p.key)}
                                onError={handleOAuthError}
                                className="px-4 py-2.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60"
                              />
                              {p.manualType && (
                                <button onClick={() => setShowManual(prev => ({ ...prev, [p.key]: !prev[p.key] }))} className="text-[11px] text-ats-text-muted hover:text-ats-text transition-colors">
                                  {isManualOpen ? 'Hide manual' : 'Manual setup'}
                                </button>
                              )}
                            </div>
                          )}

                          {!p.oauth && p.manualType && (
                            <button
                              onClick={() => setShowManual(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                              className="px-4 py-2.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all"
                            >
                              {isManualOpen ? 'Hide' : 'Configure'}
                            </button>
                          )}

                          {isTesting && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                              <span className="text-[11px] text-amber-400 font-mono">Testing...</span>
                            </div>
                          )}

                          {isManualOpen && p.manualType && renderManualFields(p.key)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Organize Brands */}
        <div
          className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-y-auto"
          style={{ transform: currentStep === 2 ? 'translateX(0)' : 'translateX(100%)' }}
        >
          <div className="pb-28">
            <div className="max-w-lg mx-auto px-4 py-6 sm:px-6 sm:py-10">

              {/* Header */}
              <div className="text-center mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-ats-text mb-2">Organize Your Brands</h1>
                <p className="text-sm text-ats-text-muted leading-relaxed max-w-sm mx-auto">
                  Group your ad accounts by client and brand. You can always change this later.
                </p>
              </div>

              {/* Client list */}
              <div className="space-y-3">
                {clients.map(client => {
                  const clientBrands = brandsForClient(client.id);
                  const isExpanded = expandedClient === client.id;

                  return (
                    <div
                      key={client.id}
                      className="bg-ats-card border border-ats-border rounded-2xl overflow-hidden transition-all"
                    >
                      {/* Client header */}
                      <button
                        onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                        className="w-full flex items-center gap-3 px-4 py-4 min-h-[56px] active:bg-ats-hover transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-ats-accent/10 border border-ats-accent/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-ats-accent">{client.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-semibold text-ats-text truncate">{client.name}</div>
                          <div className="text-[11px] text-ats-text-muted">
                            {clientBrands.length} brand{clientBrands.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-ats-text-muted transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Expanded content */}
                      <div
                        className="transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden"
                        style={{
                          maxHeight: isExpanded ? '2000px' : '0',
                          opacity: isExpanded ? 1 : 0,
                        }}
                      >
                        <div className="px-4 pb-4 space-y-3">
                          {/* Brands */}
                          {clientBrands.map(brand => {
                            const brandAccounts = accountsForBrand(brand.id);
                            return (
                              <div key={brand.id} className="bg-ats-bg rounded-xl p-3 space-y-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-ats-accent/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-ats-accent">{brand.name.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <span className="text-xs font-semibold text-ats-text">{brand.name}</span>
                                </div>

                                {/* Assigned accounts */}
                                {brandAccounts.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {brandAccounts.map(acct => (
                                      <button
                                        key={acct.id}
                                        onClick={() => handleUnassignAccount(acct.id)}
                                        disabled={assigningAccount === acct.id}
                                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 min-h-[36px] bg-ats-card border border-ats-border rounded-lg text-[11px] text-ats-text active:scale-[0.97] transition-all disabled:opacity-50 group"
                                      >
                                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ${PLATFORM_COLOR[acct.platform.toLowerCase()] || 'bg-gray-600'}`}>
                                          {acct.platform.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="truncate max-w-[120px]">{acct.name}</span>
                                        <svg className="w-3 h-3 text-ats-text-muted group-hover:text-ats-red transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Unassigned accounts to add */}
                                {unassignedAccounts.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {unassignedAccounts.map(acct => (
                                      <button
                                        key={acct.id}
                                        onClick={() => handleAssignAccount(acct.id, brand.id)}
                                        disabled={assigningAccount === acct.id}
                                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 min-h-[36px] bg-transparent border border-dashed border-ats-border rounded-lg text-[11px] text-ats-text-muted hover:text-ats-text hover:border-ats-accent active:scale-[0.97] transition-all disabled:opacity-50"
                                      >
                                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 opacity-50 ${PLATFORM_COLOR[acct.platform.toLowerCase()] || 'bg-gray-600'}`}>
                                          {acct.platform.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="truncate max-w-[120px]">{acct.name}</span>
                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {brandAccounts.length === 0 && unassignedAccounts.length === 0 && (
                                  <p className="text-[11px] text-ats-text-muted/60 italic">No accounts to assign</p>
                                )}
                              </div>
                            );
                          })}

                          {/* Add brand form */}
                          {addingBrandForClient === client.id ? (
                            <div className="flex gap-2">
                              <input
                                ref={newBrandInputRef}
                                value={newBrandName}
                                onChange={e => setNewBrandName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddBrand(client.id); if (e.key === 'Escape') { setAddingBrandForClient(null); setNewBrandName(''); } }}
                                placeholder="Brand name"
                                autoFocus
                                className="flex-1 min-w-0 bg-ats-bg border border-ats-accent/40 rounded-xl px-4 py-3 min-h-[48px] text-sm text-ats-text focus:outline-none focus:border-ats-accent transition-colors"
                              />
                              <button
                                onClick={() => handleAddBrand(client.id)}
                                disabled={!newBrandName.trim() || addingBrand}
                                className="px-5 min-h-[48px] bg-ats-accent text-white rounded-xl text-sm font-semibold active:scale-[0.97] transition-all disabled:opacity-40 shrink-0"
                              >
                                {addingBrand ? '...' : 'Add'}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingBrandForClient(client.id); setNewBrandName(''); setTimeout(() => newBrandInputRef.current?.focus(), 50); }}
                              className="w-full flex items-center justify-center gap-2 py-3 min-h-[48px] bg-ats-bg border border-dashed border-ats-border rounded-xl text-xs text-ats-text-muted hover:text-ats-text hover:border-ats-accent active:scale-[0.98] transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                              Add Brand
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add client */}
                {showAddClient ? (
                  <div className="bg-ats-card border border-ats-accent/30 rounded-2xl p-4 space-y-3">
                    <input
                      ref={newClientInputRef}
                      value={newClientName}
                      onChange={e => setNewClientName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddClient(); if (e.key === 'Escape') { setShowAddClient(false); setNewClientName(''); } }}
                      placeholder="Client or company name"
                      autoFocus
                      className="w-full bg-ats-bg border border-ats-border rounded-xl px-4 py-3 min-h-[48px] text-sm text-ats-text focus:outline-none focus:border-ats-accent transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddClient}
                        disabled={!newClientName.trim() || addingClient}
                        className="flex-1 py-3 min-h-[48px] bg-ats-accent text-white rounded-xl text-sm font-semibold active:scale-[0.97] transition-all disabled:opacity-40"
                      >
                        {addingClient ? 'Creating...' : 'Create Client'}
                      </button>
                      <button
                        onClick={() => { setShowAddClient(false); setNewClientName(''); }}
                        className="px-5 py-3 min-h-[48px] bg-ats-bg border border-ats-border rounded-xl text-sm text-ats-text-muted active:scale-[0.97] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAddClient(true); setTimeout(() => newClientInputRef.current?.focus(), 50); }}
                    className="w-full flex items-center justify-center gap-2 py-4 min-h-[56px] bg-ats-card border-2 border-dashed border-ats-border rounded-2xl text-sm text-ats-text-muted hover:text-ats-text hover:border-ats-accent active:scale-[0.98] transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {clients.length === 0 ? 'Add Your First Client' : 'Add Another Client'}
                  </button>
                )}
              </div>

              {/* Unassigned accounts section */}
              {unassignedAccounts.length > 0 && clients.length > 0 && brands.length > 0 && (
                <div className="mt-6 bg-ats-card border border-ats-border rounded-2xl p-4">
                  <h3 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-3">
                    Unassigned Accounts ({unassignedAccounts.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {unassignedAccounts.map(acct => (
                      <div
                        key={acct.id}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 min-h-[36px] bg-ats-bg border border-ats-border rounded-lg text-[11px] text-ats-text-muted"
                      >
                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ${PLATFORM_COLOR[acct.platform.toLowerCase()] || 'bg-gray-600'}`}>
                          {acct.platform.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate max-w-[140px]">{acct.name}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-ats-text-muted mt-2">
                    Tap an account inside a brand above to assign it
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky CTA footer ─────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {currentStep === 1 ? (
          <div className="relative">
            {showNextTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 -top-12 bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
                Connect at least 1 data provider to continue
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-900" />
              </div>
            )}
            <button
              onClick={() => {
                if (!canContinue) {
                  setShowNextTooltip(true);
                  if (nextTooltipTimer.current) clearTimeout(nextTooltipTimer.current);
                  nextTooltipTimer.current = setTimeout(() => setShowNextTooltip(false), 2500);
                  return;
                }
                goToStep2();
              }}
              disabled={saving}
              className={`w-full py-5 text-sm font-bold transition-all backdrop-blur-md border-t border-ats-border ${
                canContinue
                  ? 'bg-ats-accent/95 text-white hover:bg-blue-600 active:scale-[0.99] shadow-lg shadow-ats-accent/20'
                  : 'bg-gray-400/90 text-white/70 cursor-default'
              }`}
            >
              {saving ? 'Saving...' : 'Next'}
            </button>
          </div>
          ) : (
            <div className="bg-ats-card/95 backdrop-blur-md border-t border-ats-border">
              <div className="max-w-lg mx-auto px-4 py-4 sm:px-6 flex flex-col gap-2.5">
                <button
                  onClick={goLive}
                  disabled={saving}
                  className="w-full py-3.5 min-h-[52px] rounded-xl text-sm font-bold bg-ats-accent text-white hover:bg-blue-600 active:scale-[0.98] transition-all shadow-lg shadow-ats-accent/20 disabled:opacity-60"
                >
                  {saving ? 'Finishing...' : 'Continue to Dashboard'}
                </button>
                <button
                  onClick={goLive}
                  disabled={saving}
                  className="w-full py-3 min-h-[48px] rounded-xl text-xs font-medium text-ats-text-muted hover:text-ats-text active:scale-[0.98] transition-all"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
