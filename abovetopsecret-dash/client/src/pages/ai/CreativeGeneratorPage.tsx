import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface GenCreative { id: number; creative_type: string; platform: string; content: { variations: Record<string, string>[]; brief?: string }; rating: number | null; created_at: string; }

export default function CreativeGeneratorPage() {
  const [creatives, setCreatives] = useState<GenCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [type, setType] = useState('full_ad');
  const [platform, setPlatform] = useState('facebook');
  const [brief, setBrief] = useState('');
  const [useBrand, setUseBrand] = useState(true);
  const [result, setResult] = useState<GenCreative | null>(null);

  const load = useCallback(async () => { setLoading(true); try { setCreatives(await apiFetch('/creative-gen')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try { const r = await apiFetch<GenCreative>('/creative-gen/generate', { method: 'POST', body: JSON.stringify({ creative_type: type, platform, brief, use_brand_vault: useBrand }) }); setResult(r); load(); } catch {}
    finally { setGenerating(false); }
  };

  const rate = async (id: number, rating: number) => { await apiFetch(`/creative-gen/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating }) }); load(); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const variations = result?.content?.variations || [];

  if (loading) return <PageShell title="Creative Generator" subtitle="AI-powered ad creatives"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Creative Generator" subtitle="AI-powered ad creative generation">
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Generate Creative</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <select value={type} onChange={e => setType(e.target.value)} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="full_ad">Full Ad</option><option value="headline">Headlines</option><option value="ad_copy">Ad Copy</option><option value="description">Descriptions</option></select>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="facebook">Facebook</option><option value="google">Google</option><option value="tiktok">TikTok</option><option value="general">General</option></select>
        </div>
        <textarea rows={3} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Describe your product or campaign brief..." className="w-full bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text mb-3" />
        <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm text-ats-text"><input type="checkbox" checked={useBrand} onChange={e => setUseBrand(e.target.checked)} className="accent-ats-accent" />Use Brand Vault</label><button onClick={generate} disabled={generating} className="px-6 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50">{generating ? 'Generating...' : 'Generate 3 Variations'}</button></div>
      </div>

      {variations.length > 0 && <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {variations.map((v, i) => (
          <div key={i} className={cardCls}>
            <div className="text-xs text-ats-text-muted uppercase mb-2">Variation {i + 1}</div>
            {v.headline && <div className="mb-2"><span className="text-[10px] text-ats-text-muted uppercase">Headline</span><div className="text-sm font-bold text-ats-text">{v.headline}</div></div>}
            {v.body && <div className="mb-2"><span className="text-[10px] text-ats-text-muted uppercase">Body</span><div className="text-sm text-ats-text">{v.body}</div></div>}
            {v.cta && <div className="mb-2"><span className="text-[10px] text-ats-text-muted uppercase">CTA</span><div className="text-sm text-ats-accent font-semibold">{v.cta}</div></div>}
            {v.description && <div><span className="text-[10px] text-ats-text-muted uppercase">Description</span><div className="text-sm text-ats-text">{v.description}</div></div>}
            <button onClick={() => navigator.clipboard.writeText(Object.values(v).join('\n'))} className="mt-3 text-xs text-ats-accent hover:underline">Copy All</button>
          </div>
        ))}
      </div>}

      {creatives.length > 0 && <div className={`${cardCls}`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">History</h3>
        <div className="space-y-2">{creatives.slice(0, 10).map(c => (
          <div key={c.id} onClick={() => setResult(c)} className="flex items-center justify-between p-2 rounded-lg hover:bg-ats-hover cursor-pointer">
            <div><span className="text-sm text-ats-text capitalize">{c.creative_type}</span><span className="text-xs text-ats-text-muted ml-2">{c.platform}</span></div>
            <div className="flex items-center gap-2">{[1,2,3,4,5].map(s => <button key={s} onClick={(e) => { e.stopPropagation(); rate(c.id, s); }} className={`text-sm ${(c.rating || 0) >= s ? 'text-amber-400' : 'text-gray-600'}`}>★</button>)}<span className="text-xs text-ats-text-muted">{new Date(c.created_at).toLocaleDateString()}</span></div>
          </div>
        ))}</div>
      </div>}
    </PageShell>
  );
}
