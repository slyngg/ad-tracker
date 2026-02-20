import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Asset { id: number; asset_type: string; asset_key: string; asset_value: string; }

const ASSET_SECTIONS = [
  { type: 'brand_name', label: 'Brand Name', placeholder: 'Your Brand', textarea: false },
  { type: 'logo_url', label: 'Logo URL', placeholder: 'https://...', textarea: false },
  { type: 'brand_colors', label: 'Brand Colors', placeholder: '#3b82f6, #1f2937', textarea: false },
  { type: 'tone_of_voice', label: 'Tone of Voice', placeholder: 'Professional, friendly, data-driven...', textarea: true },
  { type: 'target_audience', label: 'Target Audience', placeholder: 'E-commerce store owners aged 25-45...', textarea: true },
  { type: 'usp', label: 'Unique Selling Points', placeholder: 'What makes your brand unique...', textarea: true },
  { type: 'guidelines', label: 'Brand Guidelines', placeholder: 'Dos and don\'ts for brand communication...', textarea: true },
];

export default function BrandVaultPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Asset[]>('/brand-vault');
      setAssets(data);
      const map: Record<string, string> = {};
      data.forEach(a => { map[a.asset_type] = a.asset_value; });
      setValues(map);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (type: string) => {
    setSaving(type);
    try {
      await apiFetch('/brand-vault', { method: 'POST', body: JSON.stringify({ asset_type: type, asset_key: type, asset_value: values[type] || '' }) });
      setMessage({ type: 'success', text: 'Saved!' });
    } catch { setMessage({ type: 'error', text: 'Failed to save' }); }
    finally { setSaving(null); setTimeout(() => setMessage(null), 3000); }
  };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono outline-none focus:border-ats-accent';

  if (loading) return <PageShell title="Brand Vault" subtitle="AI brand assets"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Brand Vault" subtitle="Brand assets for AI content generation">
      <p className="text-sm text-ats-text-muted mb-6">These assets are used by Operator AI when generating content, reports, and creative suggestions.</p>
      {message && <div className={`px-3 py-2 mb-4 rounded-md text-sm ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>{message.text}</div>}
      <div className="space-y-4">
        {ASSET_SECTIONS.map(section => (
          <div key={section.type} className={cardCls}>
            <div className="flex justify-between items-start mb-2">
              <label className="text-sm font-bold text-ats-text">{section.label}</label>
              <button onClick={() => save(section.type)} disabled={saving === section.type} className="px-3 py-1 bg-ats-accent text-white rounded-md text-xs font-semibold disabled:opacity-50">{saving === section.type ? 'Saving...' : 'Save'}</button>
            </div>
            {section.textarea ? (
              <textarea rows={3} value={values[section.type] || ''} onChange={e => setValues({ ...values, [section.type]: e.target.value })} placeholder={section.placeholder} className={inputCls} />
            ) : (
              <input type="text" value={values[section.type] || ''} onChange={e => setValues({ ...values, [section.type]: e.target.value })} placeholder={section.placeholder} className={inputCls} />
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
