import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import { useAuthStore, getAuthToken } from '../stores/authStore';
import { fetchTimeseries, TimeseriesPoint, fetchAccountSummary, AccountSummary } from '../lib/api';
import { ROUTES } from '../lib/routes';
import { fmt } from '../lib/formatters';
import { useAccountStore } from '../stores/accountStore';
import PageShell from '../components/shared/PageShell';
import SpendRevenueChart from '../components/charts/SpendRevenueChart';
import MetricSparkline from '../components/charts/MetricSparkline';
import AnimatedNumber from '../components/shared/AnimatedNumber';
import LiveOrderFeed from '../components/dashboard/LiveOrderFeed';
import SyncPreloader from '../components/shared/SyncPreloader';
import { Download, Share2 } from 'lucide-react';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Favorite { id: number; metric_key: string; label: string; format: string; position: number; }
interface GA4Overview { sessions: number; pageviews: number; bounce_rate: number; avg_duration: number; }
interface AttrRow { channel: string; spend: number; revenue: number; conversions: number; roas: number; nc_revenue: number; nc_conversions: number; }

const WORKSPACES = [
  { label: 'Attribution', desc: 'Campaign performance & ROI', icon: '🎯', path: ROUTES.ATTRIBUTION },
  { label: 'Website', desc: 'GA4 traffic & conversions', icon: '🌐', path: ROUTES.WEBSITE_PERFORMANCE },
  { label: 'Customers', desc: 'Segments, cohorts & LTV', icon: '👥', path: ROUTES.CUSTOMER_SEGMENTS },
  { label: 'Creative', desc: 'Ad creative analysis', icon: '🎨', path: ROUTES.CREATIVE_ANALYSIS },
  { label: 'P&L', desc: 'Profit & loss breakdown', icon: '💰', path: '/finance/pnl' },
  { label: 'AI Studio', desc: 'Agents & report builder', icon: '🤖', path: ROUTES.AI_AGENTS },
];

export default function SummaryDashboard() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);
  const { data, summary, loading, refreshing, error, refresh } = useMetrics(undefined, undefined, handleUnauthorized);
  const navigate = useNavigate();

  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [tsLoading, setTsLoading] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [ga4, setGa4] = useState<GA4Overview | null>(null);
  const [attrData, setAttrData] = useState<AttrRow[]>([]);
  const [accountSummaries, setAccountSummaries] = useState<AccountSummary[]>([]);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const selectedAccountIds = useAccountStore((s) => s.selectedAccountIds);
  const setSelectedAccountIds = useAccountStore((s) => s.setSelectedAccountIds);

  useEffect(() => {
    let cancelled = false;
    setTsLoading(true);
    fetchTimeseries('7d')
      .then((ts) => { if (!cancelled) setTimeseries(ts); })
      .catch((err) => { if (!cancelled) setFetchErrors(prev => [...prev, `Timeseries: ${err.message}`]); })
      .finally(() => { if (!cancelled) setTsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load pinned metrics, GA4 overview, attribution summary, account summaries
  useEffect(() => {
    apiFetch<Favorite[]>('/favorites').then(setFavorites).catch(() => {});
    apiFetch<GA4Overview>('/ga4/overview').then(setGa4).catch(() => {});
    apiFetch<AttrRow[]>('/attribution-models/data').then(setAttrData).catch(() => {});
    fetchAccountSummary().then(setAccountSummaries).catch(() => {});
  }, []);

  const togglePin = useCallback(async (metricKey: string, label: string) => {
    const token = getAuthToken();
    const existing = favorites.find(f => f.metric_key === metricKey);
    if (existing) {
      await fetch(`/api/favorites/${existing.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setFavorites(prev => prev.filter(f => f.id !== existing.id));
    } else {
      const res = await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ metric_key: metricKey, label, format: 'currency' }) });
      if (res.ok) { const f = await res.json(); setFavorites(prev => [...prev, f]); }
    }
  }, [favorites]);

  const roiColor = summary
    ? summary.total_roi >= 2 ? 'text-ats-green' : summary.total_roi >= 1 ? 'text-ats-yellow' : 'text-ats-red'
    : 'text-ats-text';

  const profit = summary ? summary.total_revenue - summary.total_spend : 0;
  const profitColor = profit >= 0 ? 'text-ats-green' : 'text-ats-red';

  const chartData = useMemo(
    () => timeseries.map((t) => ({ date: t.date, spend: t.spend, revenue: t.revenue })),
    [timeseries],
  );

  const spendSpark = useMemo(() => timeseries.map((t) => t.spend), [timeseries]);
  const revenueSpark = useMemo(() => timeseries.map((t) => t.revenue), [timeseries]);
  const conversionSpark = useMemo(() => timeseries.map((t) => t.conversions), [timeseries]);

  const recentActivity = useMemo(() => {
    const items: { text: string; time: string; type: 'info' | 'success' | 'warning' }[] = [];
    if (timeseries.length >= 2) {
      const latest = timeseries[timeseries.length - 1];
      const prev = timeseries[timeseries.length - 2];
      const revChange = prev.revenue > 0 ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : 0;
      const spendChange = prev.spend > 0 ? ((latest.spend - prev.spend) / prev.spend) * 100 : 0;
      items.push({ text: `Revenue ${revChange >= 0 ? 'up' : 'down'} ${Math.abs(revChange).toFixed(1)}% day-over-day`, time: latest.date, type: revChange >= 0 ? 'success' : 'warning' });
      items.push({ text: `Ad spend ${spendChange >= 0 ? 'up' : 'down'} ${Math.abs(spendChange).toFixed(1)}% day-over-day`, time: latest.date, type: spendChange <= 0 ? 'success' : 'info' });
      if (latest.roas < 1) items.push({ text: `ROAS below break-even (${latest.roas.toFixed(2)}x)`, time: latest.date, type: 'warning' });
    }
    if (data.length > 0) {
      const topOffer = [...data].sort((a, b) => b.revenue - a.revenue)[0];
      items.push({ text: `Top: ${topOffer.offer_name} (${fmt.currency(topOffer.revenue)})`, time: 'Current', type: 'info' });
      const lowRoas = data.filter((r) => r.spend > 0 && r.revenue / r.spend < 1);
      if (lowRoas.length > 0) items.push({ text: `${lowRoas.length} campaign${lowRoas.length > 1 ? 's' : ''} below break-even`, time: 'Current', type: 'warning' });
    }
    return items;
  }, [timeseries, data]);

  const exportDashboardCSV = useCallback(() => {
    if (!summary || !data.length) return;
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Spend', summary.total_spend.toFixed(2)],
      ['Total Revenue', summary.total_revenue.toFixed(2)],
      ['ROAS', summary.total_roi.toFixed(2)],
      ['Conversions', String(summary.total_conversions)],
      ['Net Profit', profit.toFixed(2)],
      [''],
      ['Offer', 'Spend', 'Revenue', 'ROI', 'Conversions'],
      ...data.map(r => [r.offer_name, r.spend.toFixed(2), r.revenue.toFixed(2), r.roi.toFixed(2), String(r.conversions)]),
    ];
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary, data, profit]);

  const shareDashboard = useCallback(async () => {
    const shareData = {
      title: 'OpticData Dashboard',
      text: summary ? `Spend: ${fmt.currency(summary.total_spend)} | Revenue: ${fmt.currency(summary.total_revenue)} | ROAS: ${fmt.ratio(summary.total_roi)}` : 'Dashboard Summary',
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      alert('Dashboard summary copied to clipboard!');
    }
  }, [summary]);

  const activityDotColor = (type: 'info' | 'success' | 'warning') => type === 'success' ? 'bg-ats-green' : type === 'warning' ? 'bg-ats-yellow' : 'bg-ats-accent';

  const pinnedMetrics = useMemo(() => {
    if (!summary || favorites.length === 0) return [];
    const metricMap: Record<string, { value: number; format: (n: number) => string }> = {
      spend: { value: summary.total_spend, format: fmt.currency },
      revenue: { value: summary.total_revenue, format: fmt.currency },
      roas: { value: summary.total_roi, format: fmt.ratio },
      conversions: { value: summary.total_conversions, format: fmt.num },
      profit: { value: profit, format: fmt.currency },
    };
    return favorites.map(f => ({ ...f, ...(metricMap[f.metric_key] || { value: 0, format: fmt.num }) }));
  }, [summary, favorites, profit]);

  const cardCls = 'bg-ats-card rounded-xl p-3 sm:p-4 border border-ats-border';

  const hasRealData = !!(summary && (summary.total_spend > 0 || summary.total_revenue > 0 || summary.total_conversions > 0));

  return (
    <PageShell
      title="Command Center"
      subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={exportDashboardCSV}
            disabled={!summary}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text hover:border-ats-accent transition-colors disabled:opacity-40"
            title="Export CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={shareDashboard}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text hover:border-ats-accent transition-colors"
            title="Share"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button onClick={() => refresh()} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      }
    >
      <SyncPreloader hasData={hasRealData} loading={loading}>
      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="text-sm text-red-300">
            <span className="font-semibold">Failed to load metrics:</span> {error}
          </div>
          <button onClick={() => refresh()} className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1 border border-red-700/50 rounded">
            Retry
          </button>
        </div>
      )}

      {/* Pinned Metrics Row */}
      {pinnedMetrics.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
          {pinnedMetrics.map(pm => (
            <div key={pm.id} className="bg-ats-accent/10 border border-ats-accent/30 rounded-lg px-4 py-2 min-w-[120px] flex-shrink-0 relative group">
              <button onClick={() => togglePin(pm.metric_key, pm.label)} className="absolute top-1 right-1 text-[10px] text-ats-accent opacity-0 group-hover:opacity-100">unpin</button>
              <div className="text-xs sm:text-[10px] text-ats-accent uppercase tracking-wider font-mono">{pm.label}</div>
              <div className="text-sm sm:text-lg font-bold text-ats-text font-mono truncate">{pm.format(pm.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div data-tour="summary-cards" className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Spend</div>
              <button onClick={() => togglePin('spend', 'Spend')} className={`text-[10px] ${favorites.some(f => f.metric_key === 'spend') ? 'text-ats-accent' : 'text-ats-text-muted hover:text-ats-accent'}`}>📌</button>
            </div>
            <div className="text-base sm:text-2xl font-bold text-ats-text font-mono truncate"><AnimatedNumber value={summary.total_spend} format={fmt.currency} /></div>
            {spendSpark.length > 0 && <div className="mt-2"><MetricSparkline data={spendSpark} color="#ef4444" height={28} /></div>}
          </div>
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Revenue</div>
              <button onClick={() => togglePin('revenue', 'Revenue')} className={`text-[10px] ${favorites.some(f => f.metric_key === 'revenue') ? 'text-ats-accent' : 'text-ats-text-muted hover:text-ats-accent'}`}>📌</button>
            </div>
            <div className="text-base sm:text-2xl font-bold text-ats-green font-mono truncate"><AnimatedNumber value={summary.total_revenue} format={fmt.currency} /></div>
            {revenueSpark.length > 0 && <div className="mt-2"><MetricSparkline data={revenueSpark} color="#22c55e" height={28} /></div>}
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">ROAS</div>
            <div className={`text-base sm:text-2xl font-bold font-mono truncate ${roiColor}`}><AnimatedNumber value={summary.total_roi} format={fmt.ratio} /></div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Conversions</div>
            <div className="text-base sm:text-2xl font-bold text-ats-text font-mono truncate"><AnimatedNumber value={summary.total_conversions} format={fmt.num} /></div>
            {conversionSpark.length > 0 && <div className="mt-2"><MetricSparkline data={conversionSpark} color="#3b82f6" height={28} /></div>}
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Net Profit</div>
            <div className={`text-base sm:text-2xl font-bold font-mono truncate ${profitColor}`}><AnimatedNumber value={profit} format={fmt.currency} /></div>
          </div>
        </div>
      )}

      {/* Account Overview — only when 2+ accounts and All Accounts selected */}
      {accountSummaries.length >= 2 && selectedAccountIds.length === 0 && (
        <>
          <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Accounts Overview</h2>
          <div className="flex gap-3 overflow-x-auto mb-6 pb-1">
            {accountSummaries.map((acct) => {
              const roas = acct.spend > 0 ? acct.revenue / acct.spend : 0;
              return (
                <button
                  key={acct.id}
                  onClick={() => setSelectedAccountIds([acct.id])}
                  className={`${cardCls} p-3 min-w-[180px] flex-shrink-0 hover:border-ats-accent transition-colors text-left`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acct.color || '#6b7280' }} />
                    <span className="text-xs font-semibold text-ats-text truncate">{acct.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-[11px]">
                    <div><span className="text-ats-text-muted">Spend</span><div className="font-mono text-ats-text">{fmt.currency(acct.spend)}</div></div>
                    <div><span className="text-ats-text-muted">Revenue</span><div className="font-mono text-ats-green">{fmt.currency(acct.revenue)}</div></div>
                    <div><span className="text-ats-text-muted">ROAS</span><div className="font-mono" style={{ color: roas >= 2 ? '#22c55e' : roas >= 1 ? '#f59e0b' : '#ef4444' }}>{fmt.ratio(roas)}</div></div>
                    <div><span className="text-ats-text-muted">Conv</span><div className="font-mono text-ats-text">{acct.conversions}</div></div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Spend vs Revenue Chart */}
      <div className={`${cardCls} mb-6`}>
        <h2 className="text-sm font-semibold text-ats-text mb-3">Spend vs Revenue (7-day)</h2>
        {tsLoading ? (
          <div className="h-[280px] flex items-center justify-center"><div className="animate-pulse text-ats-text-muted text-sm">Loading chart...</div></div>
        ) : (
          <SpendRevenueChart data={chartData} />
        )}
      </div>

      {/* Web Analytics + Attribution Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Web Analytics Summary */}
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ats-text">Web Analytics</h3>
            <button onClick={() => navigate(ROUTES.WEBSITE_PERFORMANCE)} className="text-xs text-ats-accent hover:underline">View Details →</button>
          </div>
          {ga4 ? (
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-[10px] text-ats-text-muted uppercase font-mono">Sessions</div><div className="text-sm sm:text-lg font-bold text-ats-text font-mono">{fmt.num(ga4.sessions)}</div></div>
              <div><div className="text-[10px] text-ats-text-muted uppercase font-mono">Pageviews</div><div className="text-sm sm:text-lg font-bold text-ats-text font-mono">{fmt.num(ga4.pageviews)}</div></div>
              <div><div className="text-[10px] text-ats-text-muted uppercase font-mono">Bounce Rate</div><div className="text-sm sm:text-lg font-bold text-ats-text font-mono">{fmt.pctRaw(ga4.bounce_rate)}</div></div>
              <div><div className="text-[10px] text-ats-text-muted uppercase font-mono">Avg Duration</div><div className="text-sm sm:text-lg font-bold text-ats-text font-mono">{Math.round(ga4.avg_duration)}s</div></div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-ats-text-muted mb-2">Connect GA4 for web analytics</p>
              <button onClick={() => navigate(ROUTES.CONNECTIONS)} className="text-xs text-ats-accent hover:underline">Setup GA4 →</button>
            </div>
          )}
        </div>

        {/* Attribution Summary */}
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ats-text">Attribution Summary</h3>
            <button onClick={() => navigate(ROUTES.ATTRIBUTION)} className="text-xs text-ats-accent hover:underline">Full Report →</button>
          </div>
          {attrData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-ats-text-muted uppercase">
                  <th className="text-left pb-2 font-mono">Channel</th>
                  <th className="text-right pb-2 font-mono">Spend</th>
                  <th className="text-right pb-2 font-mono">Revenue</th>
                  <th className="text-right pb-2 font-mono">ROAS</th>
                </tr></thead>
                <tbody>{attrData.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-ats-border">
                    <td className="py-1.5 text-ats-text">{r.channel}</td>
                    <td className="py-1.5 text-right text-ats-text font-mono">{fmt.currency(r.spend)}</td>
                    <td className="py-1.5 text-right text-ats-green font-mono">{fmt.currency(r.revenue)}</td>
                    <td className="py-1.5 text-right font-mono" style={{ color: r.roas >= 2 ? '#22c55e' : r.roas >= 1 ? '#f59e0b' : '#ef4444' }}>{fmt.ratio(r.roas)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ats-text-muted text-center py-6">Attribution data will appear after sync.</p>
          )}
        </div>
      </div>

      {/* Workspace Quick Links */}
      <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Workspaces</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {WORKSPACES.map((ws) => (
          <button key={ws.path} onClick={() => navigate(ws.path)} className={`${cardCls} text-left hover:border-ats-accent transition-colors group`}>
            <div className="text-2xl mb-2">{ws.icon}</div>
            <div className="text-sm font-semibold text-ats-text group-hover:text-ats-accent transition-colors">{ws.label}</div>
            <div className="text-xs sm:text-[11px] text-ats-text-muted mt-0.5">{ws.desc}</div>
          </button>
        ))}
      </div>

      {/* Recent Activity & Live Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Recent Activity</h2>
          <div className="bg-ats-card rounded-xl border border-ats-border divide-y divide-ats-border">
            {recentActivity.length === 0 ? (
              <div className="p-6 text-center text-sm text-ats-text-muted">No recent activity. Data will appear after sync.</div>
            ) : (
              recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${activityDotColor(item.type)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ats-text">{item.text}</div>
                    <div className="text-xs sm:text-[11px] text-ats-text-muted mt-0.5">{item.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Live Orders</h2>
          <LiveOrderFeed />
        </div>
      </div>
      </SyncPreloader>
    </PageShell>
  );
}
