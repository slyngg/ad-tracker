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

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface AttrRow { channel: string; spend: number; revenue: number; conversions: number; roas: number; nc_revenue: number; nc_conversions: number; }
interface OverlapRow { channel_a: string; channel_b: string; shared_conversions: number; }
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
  const [showOverlap, setShowOverlap] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, summary, loading, refreshing, error, lastFetched, refresh } = useMetrics(
    undefined, undefined, handleUnauthorized
  );

  // Load attribution model data
  useEffect(() => {
    apiFetch<AttrRow[]>(`/attribution-models/data?model=${model}`).then(setAttrData).catch(() => {});
    apiFetch<OverlapRow[]>('/attribution-models/overlap').then(setOverlap).catch(() => {});
  }, [model]);

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
        subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${syncAge.text}${refreshing ? ' · syncing...' : ''}`}
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
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs text-ats-text-muted uppercase font-mono">Attribution Model:</span>
            <div className="flex gap-1">
              {MODELS.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${model === m.id ? 'bg-ats-accent text-white' : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:border-ats-accent'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowOverlap(!showOverlap)} className="ml-auto text-xs text-ats-accent hover:underline">
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
                <div key={i} className="flex items-center gap-3">
                  <div className="w-48 text-xs text-ats-text truncate">{o.channel_a} × {o.channel_b}</div>
                  <div className="flex-1 bg-ats-bg rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-ats-accent/40 rounded-full transition-all" style={{ width: `${(o.shared_conversions / overlapMax) * 100}%` }} />
                  </div>
                  <div className="text-xs text-ats-text font-mono w-16 text-right">{o.shared_conversions} conv</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attribution by Model Table */}
        {attrData.length > 0 && (
          <div className={`${cardCls} mb-4`}>
            <h3 className="text-sm font-semibold text-ats-text mb-3">Attribution by Channel ({MODELS.find(m => m.id === model)?.label})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-ats-text-muted uppercase border-b border-ats-border">
                  <th className="text-left pb-2 font-mono">Channel</th>
                  <th className="text-right pb-2 font-mono">Spend</th>
                  <th className="text-right pb-2 font-mono">Revenue</th>
                  <th className="text-right pb-2 font-mono">Conv</th>
                  <th className="text-right pb-2 font-mono">ROAS</th>
                  <th className="text-right pb-2 font-mono">NC Revenue</th>
                  <th className="text-right pb-2 font-mono">NC Conv</th>
                  <th className="text-right pb-2 font-mono">NC CPA</th>
                </tr></thead>
                <tbody>{attrData.map((r, i) => {
                  const ncCpa = r.nc_conversions > 0 ? r.spend / r.nc_conversions : 0;
                  return (
                    <tr key={i} className="border-t border-ats-border hover:bg-ats-hover">
                      <td className="py-2 text-ats-text font-semibold">{r.channel}</td>
                      <td className="py-2 text-right text-ats-text font-mono">{fmt.currency(r.spend)}</td>
                      <td className="py-2 text-right text-ats-green font-mono">{fmt.currency(r.revenue)}</td>
                      <td className="py-2 text-right text-ats-text font-mono">{r.conversions}</td>
                      <td className="py-2 text-right font-mono" style={{ color: r.roas >= 2 ? '#22c55e' : r.roas >= 1 ? '#f59e0b' : '#ef4444' }}>{fmt.ratio(r.roas)}</td>
                      <td className="py-2 text-right text-blue-400 font-mono">{fmt.currency(r.nc_revenue)}</td>
                      <td className="py-2 text-right text-blue-400 font-mono">{r.nc_conversions}</td>
                      <td className="py-2 text-right font-mono" style={{ color: ncCpa > 50 ? '#ef4444' : '#22c55e' }}>{fmt.currency(ncCpa)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
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
        <div className="text-center pb-4"><div className="text-[10px] text-[#374151] font-mono">{filtered.length} rows · auto-refresh 60s</div></div>
      </PageShell>
    </div>
  );
}
