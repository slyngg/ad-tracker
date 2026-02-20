import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

const STEPS = ['welcome', 'connect_store', 'connect_ads', 'set_costs', 'configure_tracking', 'complete'];

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [webhookUrl] = useState(`${window.location.origin}/api/webhooks/checkout-champ`);
  const [fbToken, setFbToken] = useState('');
  const [fbAccounts, setFbAccounts] = useState('');
  const [cogs, setCogs] = useState('30');
  const [shipping, setShipping] = useState('5');
  const [gateway, setGateway] = useState('2.9');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [hasWebhookData, setHasWebhookData] = useState(false);
  const navigate = useNavigate();

  const checkWebhook = useCallback(async () => {
    try { const r = await apiFetch<{ has_data: boolean }>('/onboarding/check-webhooks'); setHasWebhookData(r.has_data); } catch {}
  }, []);

  useEffect(() => { if (step === 1) { const iv = setInterval(checkWebhook, 5000); checkWebhook(); return () => clearInterval(iv); } }, [step, checkWebhook]);

  const saveStep = async (s: string, completed: boolean, skipped = false) => {
    await apiFetch('/onboarding/step', { method: 'POST', body: JSON.stringify({ step: s, completed, skipped }) });
  };

  const testFB = async () => {
    setTesting(true); setTestResult(null);
    try {
      await apiFetch('/settings', { method: 'POST', body: JSON.stringify({ fb_access_token: fbToken, fb_ad_account_ids: fbAccounts }) });
      const r = await apiFetch<{ success: boolean; error?: string }>('/settings/test/facebook', { method: 'POST' });
      setTestResult(r);
    } catch { setTestResult({ success: false, error: 'Connection failed' }); }
    finally { setTesting(false); }
  };

  const next = async () => {
    await saveStep(STEPS[step], true);
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const skip = async () => {
    await saveStep(STEPS[step], false, true);
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const finish = async () => {
    await apiFetch('/onboarding/complete', { method: 'POST' });
    navigate('/summary');
  };

  const dot = (i: number) => `w-3 h-3 rounded-full transition-colors ${i < step ? 'bg-emerald-500' : i === step ? 'bg-ats-accent' : 'bg-gray-600'}`;

  return (
    <div className="bg-ats-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mb-8">{STEPS.map((_, i) => <div key={i} className={dot(i)} />)}</div>

        <div className="bg-ats-card rounded-2xl border border-ats-border p-8 shadow-xl">
          {/* Step 1: Welcome */}
          {step === 0 && <div className="text-center">
            <h1 className="text-2xl font-bold text-ats-text mb-3">Welcome to Above Top Secret</h1>
            <p className="text-ats-text-muted mb-8">Your all-in-one e-commerce analytics command center. Let's get your data flowing.</p>
            <button onClick={next} className="w-full py-4 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors">Let's Get Started</button>
            <button onClick={() => { apiFetch('/onboarding/demo-mode', { method: 'POST', body: JSON.stringify({ enabled: true }) }); finish(); }} className="mt-3 text-sm text-ats-text-muted hover:text-ats-text">or explore with demo data</button>
          </div>}

          {/* Step 2: Connect Store */}
          {step === 1 && <div>
            <h2 className="text-xl font-bold text-ats-text mb-2">Connect Your Store</h2>
            <p className="text-sm text-ats-text-muted mb-6">Add your webhook URL to receive order data.</p>
            <div className="bg-ats-bg rounded-lg p-4 mb-4">
              <label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">Webhook URL</label>
              <div className="flex gap-2"><input readOnly value={webhookUrl} className="flex-1 bg-ats-surface border border-ats-border rounded-md px-3 py-3 text-sm text-ats-text font-mono" /><button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="px-4 py-3 bg-ats-accent text-white rounded-md text-sm font-semibold">Copy</button></div>
            </div>
            <div className="flex items-center gap-3 mb-6">{hasWebhookData ? <><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-sm text-emerald-400 font-semibold">Connected! Data received.</span></> : <><div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" /><span className="text-sm text-ats-text-muted">Waiting for first webhook...</span></>}</div>
            <div className="flex gap-3"><button onClick={next} className="flex-1 py-4 bg-ats-accent text-white rounded-xl text-sm font-bold">Continue</button><button onClick={skip} className="text-sm text-ats-text-muted hover:text-ats-text">Skip</button></div>
          </div>}

          {/* Step 3: Connect Ads */}
          {step === 2 && <div>
            <h2 className="text-xl font-bold text-ats-text mb-2">Connect Your Ads</h2>
            <p className="text-sm text-ats-text-muted mb-6">Add your Meta Ads access token.</p>
            <div className="space-y-3 mb-4">
              <input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)} placeholder="Facebook Access Token" className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono" />
              <input type="text" value={fbAccounts} onChange={e => setFbAccounts(e.target.value)} placeholder="Ad Account IDs (comma-separated)" className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono" />
              <button onClick={testFB} disabled={testing || !fbToken} className="w-full py-3 bg-ats-surface border border-ats-border rounded-lg text-sm text-ats-text font-semibold disabled:opacity-50">{testing ? 'Testing...' : 'Test Connection'}</button>
            </div>
            {testResult && <div className={`px-3 py-2 rounded-md text-sm mb-4 ${testResult.success ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>{testResult.success ? 'Connected successfully!' : testResult.error}</div>}
            <div className="flex gap-3"><button onClick={next} className="flex-1 py-4 bg-ats-accent text-white rounded-xl text-sm font-bold">Continue</button><button onClick={skip} className="text-sm text-ats-text-muted hover:text-ats-text">Skip</button></div>
          </div>}

          {/* Step 4: Set Costs */}
          {step === 3 && <div>
            <h2 className="text-xl font-bold text-ats-text mb-2">Set Your Costs</h2>
            <p className="text-sm text-ats-text-muted mb-6">Configure base costs for profit calculations.</p>
            <div className="space-y-3 mb-6">
              <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">COGS (%)</label><input type="number" value={cogs} onChange={e => setCogs(e.target.value)} className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono" /></div>
              <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">Avg Shipping ($)</label><input type="number" value={shipping} onChange={e => setShipping(e.target.value)} className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono" /></div>
              <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">Gateway Fee (%)</label><input type="number" value={gateway} onChange={e => setGateway(e.target.value)} className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono" /></div>
            </div>
            <div className="flex gap-3"><button onClick={next} className="flex-1 py-4 bg-ats-accent text-white rounded-xl text-sm font-bold">Continue</button><button onClick={skip} className="text-sm text-ats-text-muted hover:text-ats-text">Skip</button></div>
          </div>}

          {/* Step 5: Configure Tracking */}
          {step === 4 && <div>
            <h2 className="text-xl font-bold text-ats-text mb-2">Configure Tracking</h2>
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 mb-4"><p className="text-sm text-amber-300 font-semibold">Important: Your ad_set_name must match utm_campaign for attribution to work.</p></div>
            <div className="bg-ats-bg rounded-lg p-4 mb-4">
              <label className="text-xs text-ats-text-muted uppercase font-mono mb-2 block">Meta Ads UTM Template</label>
              <code className="text-xs text-ats-accent font-mono break-all">{'?utm_source=facebook&utm_medium=paid&utm_campaign={{adset.name}}&utm_content={{ad.name}}'}</code>
              <button onClick={() => navigator.clipboard.writeText('?utm_source=facebook&utm_medium=paid&utm_campaign={{adset.name}}&utm_content={{ad.name}}')} className="mt-2 px-3 py-1 bg-ats-accent text-white rounded-md text-xs">Copy</button>
            </div>
            <div className="flex gap-3"><button onClick={next} className="flex-1 py-4 bg-ats-accent text-white rounded-xl text-sm font-bold">Continue</button><button onClick={skip} className="text-sm text-ats-text-muted hover:text-ats-text">Skip</button></div>
          </div>}

          {/* Step 6: Complete */}
          {step === 5 && <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-ats-text mb-3">Your Dashboard Is Ready!</h2>
            <p className="text-sm text-ats-text-muted mb-8">Data syncs every 10 minutes. Your dashboard will populate shortly.</p>
            <button onClick={finish} className="w-full py-4 bg-ats-accent text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors">Go to Dashboard</button>
          </div>}
        </div>

        {/* Navigation */}
        {step > 0 && step < 5 && <button onClick={() => setStep(step - 1)} className="mt-4 text-sm text-ats-text-muted hover:text-ats-text block text-center w-full">Back</button>}
      </div>
    </div>
  );
}
