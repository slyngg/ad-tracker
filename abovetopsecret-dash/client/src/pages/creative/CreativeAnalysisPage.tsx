import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { fetchAccounts, Account } from '../../lib/api';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Creative { ad_id: string; ad_name: string; platform: string; creative_type: string; headline: string; image_url: string; thumbnail_url: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number; ctr: number; cpc: number; cpa: number; roas: number; }
interface Summary { total_creatives: number; total_spend: number; avg_ctr: number; avg_roas: number; top_type: string; }

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
const selectCls = 'w-full bg-ats-surface border border-ats-border rounded-lg px-3 py-3 text-sm text-ats-text';

export default function CreativeAnalysisPage() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('spend');
  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => { fetchAccounts().then(setAccounts).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        apiFetch<Creative[]>(`/creative/performance?platform=${platform}&type=${type}&sort=${sort}`),
        apiFetch<Summary>('/creative/summary'),
      ]);
      setCreatives(c); setSummary(s);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [platform, type, sort]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const filtered = creatives.filter(c => !search || (c.ad_name || '').toLowerCase().includes(search.toLowerCase()));
  const typeBreakdown = creatives.reduce<Record<string, number>>((acc, c) => { acc[c.creative_type || 'unknown'] = (acc[c.creative_type || 'unknown'] || 0) + parseFloat(String(c.spend)); return acc; }, {});
  const pieData = Object.entries(typeBreakdown).map(([name, value]) => ({ name, value }));

  const activeFilterCount = [platform !== 'all' ? 1 : 0, type !== 'all' ? 1 : 0].reduce((a, b) => a + b, 0);

  const toggleCompare = (id: string) => {
    const next = new Set(compare);
    if (next.has(id)) next.delete(id); else if (next.size < 3) next.add(id);
    setCompare(next);
  };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Creative Analysis" showDatePicker subtitle="Ad creative performance"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  if (!creatives.length) return (
    <PageShell title="Creative Analysis" showDatePicker subtitle="Ad creative performance">
      <div className={`${cardCls} text-center p-8`}>
        <div className="text-4xl mb-4">🎨</div>
        <h3 className="text-lg font-bold text-ats-text mb-2">No Creative Data Yet</h3>
        <p className="text-sm text-ats-text-muted mb-4">Connect your ad accounts to see creative performance. Currently supported: Meta Ads.</p>
        <a href="/settings/connections" className="inline-block px-6 py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold min-h-[44px] flex items-center justify-center">View Connections</a>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Creative Analysis" showDatePicker subtitle="Ad creative performance">
      {/* Mobile: Search + Filter toggle */}
      <div className="flex gap-2 mb-3 lg:hidden">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creatives..."
          className="flex-1 bg-ats-surface border border-ats-border rounded-lg px-3 py-3 text-sm text-ats-text" />
        <button onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors ${
            filtersOpen || activeFilterCount > 0 ? 'bg-ats-accent/10 border-ats-accent text-ats-accent' : 'bg-ats-card border-ats-border text-ats-text-muted'
          }`}>
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-ats-accent text-white text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Mobile: Collapsible filter panel */}
      {filtersOpen && (
        <div className="lg:hidden mb-4 space-y-2 bg-ats-card rounded-xl p-3 border border-ats-border animate-in slide-in-from-top-2">
          <select value={platform} onChange={e => setPlatform(e.target.value)} className={selectCls}>
            <option value="all">All Platforms</option>
            {Array.from(new Set(accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token).map(a => a.platform))).map(p => (
              <option key={p} value={p === 'meta' ? 'facebook' : p}>{({meta:'Meta',tiktok:'TikTok',newsbreak:'NewsBreak',google:'Google'} as Record<string,string>)[p] || p}</option>
            ))}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} className={selectCls}>
            <option value="all">All Types</option><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className={selectCls}>
            <option value="spend">Sort: Spend</option><option value="roas">Sort: ROAS</option><option value="ctr">Sort: CTR</option><option value="conversions">Sort: Conv</option>
          </select>
        </div>
      )}

      {/* Desktop: Inline filter row */}
      <div className="hidden lg:flex flex-wrap gap-2 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
          <option value="all">All Platforms</option>
          {Array.from(new Set(accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token).map(a => a.platform))).map(p => (
            <option key={p} value={p === 'meta' ? 'facebook' : p}>{({meta:'Meta',tiktok:'TikTok',newsbreak:'NewsBreak',google:'Google'} as Record<string,string>)[p] || p}</option>
          ))}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
          <option value="all">All Types</option><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
          <option value="spend">Sort: Spend</option><option value="roas">Sort: ROAS</option><option value="ctr">Sort: CTR</option><option value="conversions">Sort: Conv</option>
        </select>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className={cardCls}><div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Total Spend</div><div className="text-lg sm:text-2xl font-bold text-ats-text font-mono">${parseFloat(String(summary.total_spend)).toFixed(0)}</div></div>
          <div className={cardCls}><div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Avg CTR</div><div className="text-lg sm:text-2xl font-bold text-ats-accent font-mono">{parseFloat(String(summary.avg_ctr)).toFixed(2)}%</div></div>
          <div className={cardCls}><div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Avg ROAS</div><div className="text-lg sm:text-2xl font-bold text-ats-text font-mono">{parseFloat(String(summary.avg_roas)).toFixed(2)}x</div></div>
          <div className={cardCls}><div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Top Type</div><div className="text-lg sm:text-2xl font-bold text-ats-text capitalize">{summary.top_type || '-'}</div></div>
        </div>
      )}

      {/* Type Breakdown Pie */}
      {pieData.length > 0 && (
        <div className={`${cardCls} mb-4 sm:mb-6`}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">Spend by Type</h3>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-[140px] h-[140px] sm:w-[120px] sm:h-[120px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius="40%" outerRadius="90%" dataKey="value" stroke="none">{pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            <div className="flex flex-wrap sm:flex-col gap-2 sm:gap-1 justify-center">{pieData.map((d, i) => <div key={d.name} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-sm text-ats-text capitalize">{d.name}: ${d.value.toFixed(0)}</span></div>)}</div>
          </div>
        </div>
      )}

      {/* Comparison */}
      {compare.size > 1 && (
        <div className={`${cardCls} mb-4 sm:mb-6`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ats-text">Comparison ({compare.size})</h3>
            <button onClick={() => setCompare(new Set())} className="text-xs text-ats-text-muted px-3 py-1.5 rounded-lg hover:bg-ats-hover">Clear</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
            {[...compare].map(id => {
              const c = creatives.find(cr => cr.ad_id === id);
              if (!c) return null;
              return <div key={id} className="bg-ats-bg rounded-lg p-3 border border-ats-border min-w-[200px] snap-start lg:min-w-0">
                <div className="text-sm font-semibold text-ats-text truncate mb-2">{c.ad_name}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono text-ats-text-muted">
                  <div>Spend: <span className="text-ats-text">${parseFloat(String(c.spend)).toFixed(2)}</span></div>
                  <div>ROAS: <span className={`font-semibold ${parseFloat(String(c.roas)) >= 2 ? 'text-emerald-400' : parseFloat(String(c.roas)) >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{parseFloat(String(c.roas)).toFixed(2)}x</span></div>
                  <div>CTR: <span className="text-ats-text">{parseFloat(String(c.ctr)).toFixed(2)}%</span></div>
                  <div>CPA: <span className="text-ats-text">${parseFloat(String(c.cpa)).toFixed(2)}</span></div>
                </div>
              </div>;
            })}
          </div>
        </div>
      )}

      {/* Mobile: Creative Cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map((c, i) => {
          const isExpanded = expandedCard === c.ad_id;
          const roasVal = parseFloat(String(c.roas));
          const roasColor = roasVal >= 2 ? 'text-emerald-400' : roasVal >= 1 ? 'text-amber-400' : 'text-red-400';
          return (
            <div key={i} className={`${cardCls} ${compare.has(c.ad_id) ? 'border-ats-accent/40' : ''}`}>
              <div className="flex items-start gap-3" onClick={() => setExpandedCard(isExpanded ? null : c.ad_id)}>
                <input type="checkbox" checked={compare.has(c.ad_id)} onChange={(e) => { e.stopPropagation(); toggleCompare(c.ad_id); }}
                  className="accent-ats-accent mt-1 w-5 h-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ats-text truncate">{c.ad_name || c.ad_id}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-ats-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-ats-text-muted flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-ats-text-muted">
                    <span className="capitalize">{c.platform}</span>
                    <span className="w-1 h-1 rounded-full bg-ats-border" />
                    <span className="capitalize">{c.creative_type || '-'}</span>
                  </div>
                  {/* Key metrics always visible */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm font-mono font-semibold text-ats-text">${parseFloat(String(c.spend)).toFixed(0)}</span>
                    <span className={`text-sm font-mono font-bold ${roasColor}`}>{roasVal.toFixed(2)}x</span>
                    <span className="text-xs font-mono text-ats-text-muted">{parseFloat(String(c.ctr)).toFixed(2)}% CTR</span>
                  </div>
                </div>
              </div>
              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-ats-border grid grid-cols-2 gap-2">
                  <div className="bg-ats-bg rounded-lg px-3 py-2">
                    <div className="text-[10px] text-ats-text-muted uppercase">Impressions</div>
                    <div className="text-sm font-mono text-ats-text">{Number(c.impressions).toLocaleString()}</div>
                  </div>
                  <div className="bg-ats-bg rounded-lg px-3 py-2">
                    <div className="text-[10px] text-ats-text-muted uppercase">Clicks</div>
                    <div className="text-sm font-mono text-ats-text">{Number(c.clicks).toLocaleString()}</div>
                  </div>
                  <div className="bg-ats-bg rounded-lg px-3 py-2">
                    <div className="text-[10px] text-ats-text-muted uppercase">Conversions</div>
                    <div className="text-sm font-mono text-ats-text">{Number(c.conversions)}</div>
                  </div>
                  <div className="bg-ats-bg rounded-lg px-3 py-2">
                    <div className="text-[10px] text-ats-text-muted uppercase">CPA</div>
                    <div className="text-sm font-mono text-ats-text">${parseFloat(String(c.cpa)).toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: Creative Table */}
      <div className={`${cardCls} overflow-hidden hidden lg:block`}>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            <th className="px-2 py-2 w-8"></th>
            {['Ad Name', 'Platform', 'Type', 'Spend', 'Impressions', 'Clicks', 'CTR', 'Conv', 'CPA', 'ROAS'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {filtered.map((c, i) => <tr key={i} className={`border-b border-ats-border last:border-0 hover:bg-ats-hover/50 ${compare.has(c.ad_id) ? 'bg-ats-accent/10' : ''}`}>
              <td className="px-2 py-2"><input type="checkbox" checked={compare.has(c.ad_id)} onChange={() => toggleCompare(c.ad_id)} className="accent-ats-accent" /></td>
              <td className="px-3 py-2 text-sm text-ats-text font-semibold max-w-[180px] truncate">{c.ad_name || c.ad_id}</td>
              <td className="px-3 py-2 text-sm text-ats-text-muted capitalize">{c.platform}</td>
              <td className="px-3 py-2 text-sm text-ats-text-muted capitalize">{c.creative_type || '-'}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(c.spend)).toFixed(2)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(c.impressions).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(c.clicks).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{parseFloat(String(c.ctr)).toFixed(2)}%</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(c.conversions)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(c.cpa)).toFixed(2)}</td>
              <td className={`px-3 py-2 text-sm font-mono font-bold ${parseFloat(String(c.roas)) >= 2 ? 'text-emerald-400' : parseFloat(String(c.roas)) >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{parseFloat(String(c.roas)).toFixed(2)}x</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
