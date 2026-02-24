import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuthStore, getAuthToken } from '../../stores/authStore';
import SummaryCards from '../../components/dashboard/SummaryCards';
import Filters from '../../components/dashboard/Filters';
import MetricsTable from '../../components/dashboard/MetricsTable';
import MobileCard from '../../components/dashboard/MobileCard';
import ExportButton from '../../components/dashboard/ExportButton';
import LiveOrderFeed from '../../components/dashboard/LiveOrderFeed';
import PageShell from '../../components/shared/PageShell';
import { fmt } from '../../lib/formatters';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useDateRangeStore } from '../../stores/dateRangeStore';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface AttrRow { source: string; spend: number; revenue: number; purchases: number; roas: number; cpa: number; nc_cpa: number; nc_roas: number; clicks: number; impressions: number; ctr: number; cpm: number; cpc: number; }
interface OverlapRow { channel_a: string; channel_b: string; shared_conversions: number; }
interface AdRow {
  platform: string; ad_id: string; ad_name: string; campaign_name: string; adset_name: string;
  cost: number; impressions: number; cpm: number; clicks: number; cpc: number; ctr: number;
  conversions: number; cpa: number; cvr: number; total_conversion_value: number; value_per_conversion: number;
  synced_at: string;
}
const MODELS = [
  { id: 'last_click', label: 'Last Click' },
  { id: 'first_click', label: 'First Click' },
  { id: 'linear', label: 'Linear' },
  { id: 'time_decay', label: 'Time Decay' },
];

export default function AttributionDashboard() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);

  const [filterOffer, setFilterOffer] = useState('All');
  const [filterAccount, setFilterAccount] = useState('All');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [model, setModel] = useState('last_click');
  const [attrData, setAttrData] = useState<AttrRow[]>([]);
  const [overlap, setOverlap] = useState<OverlapRow[]>([]);
  const [adRows, setAdRows] = useState<AdRow[]>([]);
  const [adSort, setAdSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'cost', dir: 'desc' });
  const [adPlatformFilter, setAdPlatformFilter] = useState('all');
  const [showOverlap, setShowOverlap] = useState(false);
  const dateRange = useDateRangeStore((s) => s.dateRange);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, summary, loading, refreshing, error, lastFetched, refresh } = useMetrics(
    undefined, undefined, handleUnauthorized
  );

  // Load attribution model data
  const loadAttr = useCallback(() => {
    const toIso = (d: Date) => d.toISOString().split('T')[0];
    const dateParams = dateRange.isToday ? '' : `&start_date=${toIso(dateRange.from)}&end_date=${toIso(dateRange.to)}`;
    const dateQs = dateRange.isToday ? '' : `?start_date=${toIso(dateRange.from)}&end_date=${toIso(dateRange.to)}`;
    apiFetch<{ model: string; data: AttrRow[] }>(`/attribution-models/data?model=${model}${dateParams}`).then(r => setAttrData(r.data || [])).catch(() => {});
    apiFetch<OverlapRow[]>(`/attribution-models/overlap${dateQs}`).then(setOverlap).catch(() => {});
    apiFetch<AdRow[]>(`/attribution-models/ads${dateQs}`).then(setAdRows).catch(() => {});
  }, [model, dateRange]);

  useEffect(() => { loadAttr(); }, [loadAttr]);
  useLiveRefresh(loadAttr);

  const offers = useMemo(() => {
    const set = new Set(data.map((d) => d.offer_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  const accounts = useMemo(() => {
    const set = new Set(data.map((d) => d.account_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  const filtered = useMemo(() => {
    let rows = [...data];
    if (filterOffer !== 'All') rows = rows.filter((r) => r.offer_name === filterOffer);
    if (filterAccount !== 'All') rows = rows.filter((r) => r.account_name === filterAccount);
    rows.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortCol];
      const bVal = (b as unknown as Record<string, unknown>)[sortCol];
      if (typeof aVal === 'string' && typeof bVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
    return rows;
  }, [data, filterOffer, filterAccount, sortCol, sortDir]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  }, [sortCol]);

  const syncAge = useMemo(() => {
    if (!lastFetched) return { text: 'syncing...', color: 'text-ats-text-muted' };
    const seconds = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (seconds < 60) return { text: `${seconds}s ago`, color: 'text-ats-text-muted' };
    const minutes = Math.floor(seconds / 60);
    if (minutes > 5) return { text: `${minutes}m ago`, color: 'text-ats-red' };
    if (minutes > 2) return { text: `${minutes}m ago`, color: 'text-ats-yellow' };
    return { text: `${minutes}m ago`, color: 'text-ats-text-muted' };
  }, [lastFetched]);

  const [, setTick] = useState(0);
  useEffect(() => { const interval = setInterval(() => setTick((t) => t + 1), 10000); return () => clearInterval(interval); }, []);

  const [isWide, setIsWide] = useState(typeof window !== 'undefined' ? window.innerWidth > 768 : true);
  useEffect(() => { const h = () => setIsWide(window.innerWidth > 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  const showTable = viewMode === 'table' || (viewMode === 'auto' && isWide);

  const handleTouchStart = (e: React.TouchEvent) => { if (containerRef.current && containerRef.current.scrollTop === 0) { touchStartY.current = e.touches[0].clientY; setIsPulling(true); } };
  const handleTouchMove = (e: React.TouchEvent) => { if (!isPulling) return; const diff = e.touches[0].clientY - touchStartY.current; if (diff > 0) setPullDistance(Math.min(diff * 0.5, 80)); };
  const handleTouchEnd = async () => { if (pullDistance > 60) await refresh(); setPullDistance(0); setIsPulling(false); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  // Channel overlap max for scaling
  const overlapMax = useMemo(() => Math.max(...overlap.map(o => o.shared_conversions), 1), [overlap]);

  // Ad-level data: filter + sort
  const adPlatforms = useMemo(() => {
    const set = new Set(adRows.map(r => r.platform));
    return ['all', ...Array.from(set)];
  }, [adRows]);

  const sortedAds = useMemo(() => {
    let rows = adPlatformFilter === 'all' ? [...adRows] : adRows.filter(r => r.platform === adPlatformFilter);
    rows.sort((a, b) => {
      const av = (a as any)[adSort.col] ?? 0;
      const bv = (b as any)[adSort.col] ?? 0;
      if (typeof av === 'string') return adSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return adSort.dir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [adRows, adPlatformFilter, adSort]);

  const handleAdSort = useCallback((col: string) => {
    setAdSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  }, []);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen"
      style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: isPulling ? 'none' : 'transform 0.3s ease' }}
    >
      {pullDistance > 0 && (
        <div className={`absolute top-2 left-1/2 -translate-x-1/2 text-xs font-mono px-4 py-1.5 rounded-full z-10 border ${pullDistance > 60 ? 'text-ats-green bg-ats-card border-ats-green' : 'text-ats-text-muted bg-ats-card border-ats-border'}`}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      <PageShell
        title="Attribution"
        showDatePicker
        subtitle={<><span className={syncAge.color}>{syncAge.text}</span>{refreshing ? ' · syncing...' : ''}</>}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode((v) => (v === 'table' ? 'cards' : 'table'))} className="bg-ats-border text-ats-text-muted px-3.5 py-2.5 rounded-md text-xs cursor-pointer hover:bg-ats-hover transition-colors">
              {showTable ? 'Cards' : 'Table'}
            </button>
            <ExportButton data={filtered} />
          </div>
        }
      >
        {/* Model Selector */}
        <div className={`${cardCls} mb-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="text-xs text-ats-text-muted uppercase font-mono">Attribution Model:</span>
            <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
              {MODELS.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)} className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-h-[36px] sm:min-h-0 ${model === m.id ? 'bg-ats-accent text-white' : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:border-ats-accent'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowOverlap(!showOverlap)} className="sm:ml-auto text-xs text-ats-accent hover:underline text-left">
              {showOverlap ? 'Hide' : 'Show'} Channel Overlap
            </button>
          </div>
        </div>

        {/* Channel Overlap Visualization */}
        {showOverlap && overlap.length > 0 && (
          <div className={`${cardCls} mb-4`}>
            <h3 className="text-sm font-semibold text-ats-text mb-3">Channel Overlap</h3>
            <div className="space-y-2">
              {overlap.slice(0, 10).map((o, i) => (
                <div key={i} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-24 sm:w-48 text-[10px] sm:text-xs text-ats-text truncate">{o.channel_a} × {o.channel_b}</div>
                  <div className="flex-1 bg-ats-bg rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-ats-accent/40 rounded-full transition-all" style={{ width: `${(o.shared_conversions / overlapMax) * 100}%` }} />
                  </div>
                  <div className="text-[10px] sm:text-xs text-ats-text font-mono w-12 sm:w-16 text-right">{o.shared_conversions}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attribution by Model */}
        {attrData.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ats-text mb-3">Attribution by Channel ({MODELS.find(m => m.id === model)?.label})</h3>

            {/* Desktop table */}
            <div className={`${cardCls} hidden md:block`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-ats-text-muted uppercase border-b border-ats-border">
                    <th className="text-left pb-2 font-mono">Channel</th>
                    <th className="text-right pb-2 font-mono">Spend</th>
                    <th className="text-right pb-2 font-mono">Revenue</th>
                    <th className="text-right pb-2 font-mono">Purchases</th>
                    <th className="text-right pb-2 font-mono">ROAS</th>
                    <th className="text-right pb-2 font-mono">CPA</th>
                    <th className="text-right pb-2 font-mono">NC CPA</th>
                    <th className="text-right pb-2 font-mono">NC ROAS</th>
                  </tr></thead>
                  <tbody>{attrData.map((r, i) => {
                    const roas = parseFloat(String(r.roas)) || 0;
                    const ncCpa = parseFloat(String(r.nc_cpa)) || 0;
                    return (
                      <tr key={i} className="border-t border-ats-border hover:bg-ats-hover">
                        <td className="py-2 text-ats-text font-semibold">{r.source}</td>
                        <td className="py-2 text-right text-ats-text font-mono">{fmt.currency(r.spend)}</td>
                        <td className="py-2 text-right text-ats-green font-mono">{fmt.currency(r.revenue)}</td>
                        <td className="py-2 text-right text-ats-text font-mono">{r.purchases}</td>
                        <td className="py-2 text-right font-mono" style={{ color: roas >= 2 ? 'var(--color-positive)' : roas >= 1 ? 'var(--color-warning)' : 'var(--color-negative)' }}>{fmt.ratio(roas)}</td>
                        <td className="py-2 text-right text-ats-text font-mono">{fmt.currency(r.cpa)}</td>
                        <td className="py-2 text-right font-mono" style={{ color: ncCpa > 50 ? 'var(--color-negative)' : 'var(--color-positive)' }}>{fmt.currency(ncCpa)}</td>
                        <td className="py-2 text-right text-blue-400 font-mono">{fmt.ratio(parseFloat(String(r.nc_roas)) || 0)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {attrData.map((r, i) => {
                const roas = parseFloat(String(r.roas)) || 0;
                const ncRoas = parseFloat(String(r.nc_roas)) || 0;
                const roasColor = roas >= 2 ? 'text-ats-green' : roas >= 1 ? 'text-ats-yellow' : 'text-ats-red';
                return (
                  <div key={i} className={cardCls}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-sm font-bold text-ats-text">{r.source}</div>
                      <div className="text-right">
                        <div className={`text-lg font-bold font-mono ${roasColor}`}>{fmt.ratio(roas)}</div>
                        <div className="text-[10px] text-ats-text-muted">ROAS</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Spend</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(r.spend)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Revenue</div>
                        <div className="text-sm font-semibold text-ats-green font-mono">{fmt.currency(r.revenue)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Purchases</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{r.purchases}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">CPA</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(r.cpa)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">NC CPA</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(parseFloat(String(r.nc_cpa)) || 0)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">NC ROAS</div>
                        <div className="text-sm font-semibold text-blue-400 font-mono">{fmt.ratio(ncRoas)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Ad-Level Performance */}
        {sortedAds.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-ats-text">Ad Performance</h3>
              <div className="flex gap-1 overflow-x-auto">
                {adPlatforms.map(p => (
                  <button key={p} onClick={() => setAdPlatformFilter(p)}
                    className={`px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${adPlatformFilter === p ? 'bg-ats-accent text-white' : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:border-ats-accent'}`}>
                    {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop table */}
            <div className={`${cardCls} hidden md:block`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead><tr className="text-ats-text-muted uppercase border-b border-ats-border">
                    {[
                      { key: 'platform', label: 'Src' },
                      { key: 'ad_name', label: 'Ad' },
                      { key: 'campaign_name', label: 'Campaign' },
                      { key: 'cost', label: 'Cost' },
                      { key: 'impressions', label: 'Impr' },
                      { key: 'cpm', label: 'CPM' },
                      { key: 'clicks', label: 'Clicks' },
                      { key: 'cpc', label: 'CPC' },
                      { key: 'ctr', label: 'CTR' },
                      { key: 'conversions', label: 'Conv' },
                      { key: 'cpa', label: 'CPA' },
                      { key: 'cvr', label: 'CVR' },
                      { key: 'total_conversion_value', label: 'Conv Value' },
                      { key: 'value_per_conversion', label: 'Val/Conv' },
                    ].map(col => (
                      <th key={col.key} onClick={() => handleAdSort(col.key)}
                        className={`pb-2 font-mono cursor-pointer hover:text-ats-accent ${col.key === 'ad_name' || col.key === 'campaign_name' || col.key === 'platform' ? 'text-left' : 'text-right'} ${adSort.col === col.key ? 'text-ats-accent' : ''}`}>
                        {col.label}{adSort.col === col.key ? (adSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>{sortedAds.map((r, i) => (
                    <tr key={`${r.platform}-${r.ad_id}-${i}`} className="border-t border-ats-border hover:bg-ats-hover">
                      <td className="py-1.5 text-ats-text-muted">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          r.platform === 'newsbreak' ? 'bg-orange-600/20 text-orange-400' :
                          r.platform === 'meta' ? 'bg-blue-600/20 text-blue-400' :
                          'bg-pink-600/20 text-pink-400'
                        }`}>{r.platform === 'newsbreak' ? 'NB' : r.platform === 'meta' ? 'FB' : 'TT'}</span>
                      </td>
                      <td className="py-1.5 text-ats-text max-w-[200px] truncate" title={r.ad_name}>{r.ad_name || '—'}</td>
                      <td className="py-1.5 text-ats-text-muted max-w-[160px] truncate" title={r.campaign_name}>{r.campaign_name || '—'}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{fmt.currency(r.cost)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{fmt.num(r.impressions)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{fmt.currency(r.cpm)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{fmt.num(r.clicks)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{fmt.currency(r.cpc)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{(parseFloat(String(r.ctr)) * 100).toFixed(2)}%</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{r.conversions}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{parseFloat(String(r.cpa)) > 0 ? fmt.currency(r.cpa) : '—'}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{(parseFloat(String(r.cvr)) * 100).toFixed(2)}%</td>
                      <td className="py-1.5 text-right text-ats-green font-mono">{fmt.currency(r.total_conversion_value)}</td>
                      <td className="py-1.5 text-right text-ats-text font-mono">{parseFloat(String(r.value_per_conversion)) > 0 ? fmt.currency(r.value_per_conversion) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="text-[10px] text-ats-text-muted mt-2 font-mono">{sortedAds.length} ads</div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {sortedAds.map((r, i) => {
                const roas = r.cost > 0 ? r.total_conversion_value / r.cost : 0;
                const roasColor = roas >= 2 ? 'text-ats-green' : roas >= 1 ? 'text-ats-yellow' : 'text-ats-red';
                const platformBadge = r.platform === 'newsbreak' ? { cls: 'bg-orange-600/20 text-orange-400', label: 'NB' } :
                  r.platform === 'meta' ? { cls: 'bg-blue-600/20 text-blue-400', label: 'FB' } :
                  { cls: 'bg-pink-600/20 text-pink-400', label: 'TT' };
                return (
                  <div key={`${r.platform}-${r.ad_id}-${i}`} className={cardCls}>
                    {/* Header: platform badge + ad name + ROAS */}
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${platformBadge.cls}`}>{platformBadge.label}</span>
                          <span className="text-sm font-bold text-ats-text truncate">{r.ad_name || '—'}</span>
                        </div>
                        <div className="text-[11px] text-ats-text-muted truncate">{r.campaign_name || '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold font-mono ${roasColor}`}>{fmt.ratio(roas)}</div>
                        <div className="text-[10px] text-ats-text-muted">ROAS</div>
                      </div>
                    </div>
                    {/* Key metrics row */}
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Cost</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(r.cost)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Revenue</div>
                        <div className="text-sm font-semibold text-ats-green font-mono">{fmt.currency(r.total_conversion_value)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">Conv</div>
                        <div className="text-sm font-semibold text-ats-text font-mono">{r.conversions}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">CPA</div>
                        <div className="text-[13px] font-semibold text-ats-text font-mono">{parseFloat(String(r.cpa)) > 0 ? fmt.currency(r.cpa) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">CTR</div>
                        <div className="text-[13px] font-semibold text-ats-text font-mono">{(parseFloat(String(r.ctr)) * 100).toFixed(2)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase">CPC</div>
                        <div className="text-[13px] font-semibold text-ats-text font-mono">{fmt.currency(r.cpc)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="text-[10px] text-ats-text-muted text-center font-mono py-1">{sortedAds.length} ads</div>
            </div>
          </div>
        )}

        <Filters
          offers={offers}
          accounts={accounts}
          filterOffer={filterOffer}
          filterAccount={filterAccount}
          onOfferChange={setFilterOffer}
          onAccountChange={setFilterAccount}
        />

        <SummaryCards summary={summary} />

        {loading && data.length === 0 && (
          <div className="mt-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-ats-card rounded-xl mb-3 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />)}</div>
        )}

        {error && <div className="text-center py-5 text-ats-red text-sm">{error}</div>}

        {!loading && !error && data.length === 0 && (
          <div className="text-center py-10 text-ats-text-muted">
            <div className="text-base mb-2">No data yet</div>
            <div className="text-sm">Waiting for Meta ad sync or webhook data.</div>
          </div>
        )}

        <div className="pb-4">
          {filtered.length > 0 && showTable && <MetricsTable data={filtered} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
          {filtered.length > 0 && !showTable && (
            <div className="mt-2">{filtered.map((row, i) => <MobileCard key={`${row.offer_name}-${row.account_name}-${i}`} row={row} expanded={expandedIdx === i} onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)} />)}</div>
          )}
        </div>

        <div className="mt-4 mb-4"><LiveOrderFeed /></div>
        <div className="text-center pb-4"><div className="text-[10px] text-ats-text-muted font-mono">{filtered.length} rows · auto-refresh 60s</div></div>
      </PageShell>
    </div>
  );
}
