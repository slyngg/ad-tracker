import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import PageShell from '../../components/shared/PageShell';
import {
  fetchTopPerforming, fetchComparative, fetchLaunchAnalysis,
  CreativeItem, ComparativeRow, createSnapshot,
} from '../../lib/api';
import { getAuthToken } from '../../stores/authStore';

const TAG_DIMENSIONS = [
  'asset_type', 'visual_format', 'hook_type', 'creative_angle',
  'messaging_theme', 'talent_type', 'offer_type', 'cta_style',
];
const SORT_OPTIONS = ['spend', 'roas', 'cpa', 'revenue', 'clicks', 'ctr', 'cvr'];
const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${color || 'text-ats-text-muted'}`}>
      {label}: <span className="font-semibold text-ats-text">{value}</span>
    </span>
  );
}

function MomentumBadge({ momentum }: { momentum?: string }) {
  if (!momentum) return null;
  const colors: Record<string, string> = { scaling: 'bg-emerald-500/20 text-emerald-400', declining: 'bg-red-500/20 text-red-400', neutral: 'bg-gray-500/20 text-gray-400' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${colors[momentum] || colors.neutral}`}>{momentum}</span>;
}

function AIPanel({ filters, dateFrom, dateTo }: { filters: Record<string, string>; dateFrom: string; dateTo: string }) {
  const [open, setOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState('');

  const runAI = async (endpoint: string) => {
    setStreaming(true);
    setResult('');
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/creatives/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...filters, date_from: dateFrom, date_to: dateTo }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') setResult(prev => prev + parsed.text);
          } catch { /* ignore */ }
        }
      }
    } catch { setResult('Error running analysis.'); }
    finally { setStreaming(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} className="px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded-lg text-sm font-semibold hover:bg-purple-600/30 transition-colors">AI Analysis</button>;

  return (
    <div className={`${cardCls} mt-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ats-text">AI Creative Strategist</h3>
        <button onClick={() => setOpen(false)} className="text-ats-text-muted text-xs hover:text-ats-text">Close</button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => runAI('analyze-report')} disabled={streaming} className="px-3 py-1.5 bg-ats-accent/20 text-ats-accent rounded-lg text-xs font-semibold hover:bg-ats-accent/30 disabled:opacity-50">Analyze Report</button>
        <button onClick={() => runAI('next-ads')} disabled={streaming} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/30 disabled:opacity-50">Next Ads to Make</button>
        <button onClick={() => runAI('weekly-retro')} disabled={streaming} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-50">Weekly Retro</button>
      </div>
      {(result || streaming) && (
        <div className="bg-ats-bg rounded-lg p-3 text-sm text-ats-text whitespace-pre-wrap max-h-96 overflow-y-auto">
          {result || 'Analyzing...'}
          {streaming && <span className="inline-block w-2 h-4 bg-ats-accent animate-pulse ml-1" />}
        </div>
      )}
    </div>
  );
}

export default function CreativeAnalyticsPage() {
  const [tab, setTab] = useState<'top' | 'comparative' | 'launch'>('top');
  const [loading, setLoading] = useState(true);
  const [creatives, setCreatives] = useState<CreativeItem[]>([]);
  const [comparative, setComparative] = useState<ComparativeRow[]>([]);
  const [launches, setLaunches] = useState<CreativeItem[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState('spend');
  const [platform, setPlatform] = useState('');
  const [compDimension, setCompDimension] = useState('asset_type');
  const [compMetric, setCompMetric] = useState('roas');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'top') {
        const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo, sort_by: sortBy };
        if (platform) params.platform = platform;
        const data = await fetchTopPerforming(params);
        setCreatives(data);
      } else if (tab === 'comparative') {
        const data = await fetchComparative({ date_from: dateFrom, date_to: dateTo, dimension: compDimension, metric: compMetric });
        setComparative(data);
      } else {
        const data = await fetchLaunchAnalysis();
        setLaunches(data);
      }
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [tab, dateFrom, dateTo, sortBy, platform, compDimension, compMetric]);

  useEffect(() => { load(); }, [load]);

  const filtered = creatives.filter(c => !search || (c.ad_name || '').toLowerCase().includes(search.toLowerCase()));

  const handleSnapshot = async () => {
    try {
      const snap = await createSnapshot({
        title: `Creative Report - ${tab}`,
        report_type: tab,
        report_config: { dateFrom, dateTo, sortBy, platform, compDimension, compMetric },
      });
      navigator.clipboard?.writeText(window.location.origin + snap.url);
      alert('Snapshot URL copied to clipboard!');
    } catch { alert('Failed to create snapshot'); }
  };

  const tabs = [
    { key: 'top' as const, label: 'Top Performing' },
    { key: 'comparative' as const, label: 'Comparative' },
    { key: 'launch' as const, label: 'Launch Analysis' },
  ];

  return (
    <PageShell title="Creative Analytics" subtitle="Motion-grade creative performance analysis" actions={
      <div className="flex items-center gap-2">
        <button onClick={handleSnapshot} className="px-3 py-1.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:text-ats-text">Share Snapshot</button>
        <AIPanel filters={{ platform }} dateFrom={dateFrom} dateTo={dateTo} />
      </div>
    }>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-ats-card rounded-lg p-1 border border-ats-border w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === t.key ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />
        {tab === 'top' && (
          <>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
              <option value="">All Platforms</option><option value="meta">Meta</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
              {SORT_OPTIONS.map(s => <option key={s} value={s}>Sort: {s.toUpperCase()}</option>)}
            </select>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ads..." className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />
          </>
        )}
        {tab === 'comparative' && (
          <>
            <select value={compDimension} onChange={e => setCompDimension(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
              {TAG_DIMENSIONS.map(d => <option key={d} value={d}>Group: {d.replace(/_/g, ' ')}</option>)}
              <option value="campaign_name">Group: Campaign</option>
              <option value="adset_name">Group: Adset</option>
              <option value="creative_type">Group: Type</option>
            </select>
            <select value={compMetric} onChange={e => setCompMetric(e.target.value)} className="bg-ats-card border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
              {SORT_OPTIONS.map(s => <option key={s} value={s}>Metric: {s.toUpperCase()}</option>)}
            </select>
          </>
        )}
      </div>

      {loading && <div className="h-20 bg-ats-card rounded-xl animate-pulse" />}

      {/* Top Performing Tab */}
      {!loading && tab === 'top' && (
        <div className="grid gap-3">
          {filtered.length === 0 && <div className={`${cardCls} text-center py-8 text-ats-text-muted`}>No creative data found for this period.</div>}
          {filtered.map((c, i) => (
            <div key={i} className={`${cardCls} flex gap-4`}>
              <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-ats-bg overflow-hidden">
                {(c.thumbnail_url || c.image_url) ? (
                  <img src={c.thumbnail_url || c.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ats-text-muted text-xs">{c.creative_type || 'Ad'}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-ats-text truncate">{c.ad_name || c.ad_id}</span>
                  <MomentumBadge momentum={c.momentum} />
                </div>
                <div className="text-xs text-ats-text-muted mb-2">{c.campaign_name} {c.headline ? `| ${c.headline}` : ''}</div>
                <div className="flex flex-wrap gap-2">
                  <MetricChip label="Spend" value={`$${parseFloat(String(c.spend)).toFixed(0)}`} />
                  <MetricChip label="ROAS" value={`${parseFloat(String(c.roas)).toFixed(2)}x`} color={parseFloat(String(c.roas)) >= 2 ? 'text-emerald-400' : parseFloat(String(c.roas)) >= 1 ? 'text-amber-400' : 'text-red-400'} />
                  <MetricChip label="CPA" value={`$${parseFloat(String(c.cpa)).toFixed(2)}`} />
                  <MetricChip label="Revenue" value={`$${parseFloat(String(c.revenue)).toFixed(0)}`} />
                  <MetricChip label="CTR" value={`${(parseFloat(String(c.ctr)) * 100).toFixed(2)}%`} />
                  <MetricChip label="CVR" value={`${(parseFloat(String(c.cvr)) * 100).toFixed(2)}%`} />
                </div>
                {c.asset_type && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[c.asset_type, c.hook_type, c.creative_angle, c.visual_format].filter(Boolean).map((t, j) => (
                      <span key={j} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px]">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparative Tab */}
      {!loading && tab === 'comparative' && (
        <div>
          {comparative.length > 0 && (
            <div className={`${cardCls} mb-4`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={comparative} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                  <XAxis dataKey="dimension_value" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey={`avg_${compMetric}`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className={`${cardCls} overflow-x-auto`}>
            <table className="w-full">
              <thead><tr className="border-b border-ats-border">
                {['Dimension', 'Creatives', 'Total Spend', 'Avg ROAS', 'Avg CPA', 'Avg CTR', 'Avg CVR'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {comparative.map((r, i) => (
                  <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
                    <td className="px-3 py-2 text-sm font-semibold text-ats-text capitalize">{(r.dimension_value || '-').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">{r.creative_count}</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.total_spend)).toFixed(0)}</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">{parseFloat(String(r.avg_roas)).toFixed(2)}x</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.avg_cpa)).toFixed(2)}</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(r.avg_ctr)) * 100).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(r.avg_cvr)) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
                {comparative.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ats-text-muted">No data for this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Launch Analysis Tab */}
      {!loading && tab === 'launch' && (
        <div className="grid gap-3">
          {launches.length === 0 && <div className={`${cardCls} text-center py-8 text-ats-text-muted`}>No new creatives launched in the past 7 days.</div>}
          {launches.map((c, i) => (
            <div key={i} className={`${cardCls} flex gap-4`}>
              <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-ats-bg overflow-hidden">
                {(c.thumbnail_url || c.image_url) ? (
                  <img src={c.thumbnail_url || c.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ats-text-muted text-xs">{c.creative_type || 'Ad'}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-ats-text truncate">{c.ad_name || c.ad_id}</span>
                  <MomentumBadge momentum={c.momentum} />
                  <span className="text-[10px] text-ats-text-muted">Launched {c.first_seen}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <MetricChip label="Spend" value={`$${parseFloat(String((c as any).last_3_spend || 0)).toFixed(0)}`} />
                  <MetricChip label="ROAS" value={`${parseFloat(String((c as any).last_3_roas || 0)).toFixed(2)}x`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
