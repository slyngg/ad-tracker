import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import { useAuthStore } from '../stores/authStore';
import { fetchTimeseries, TimeseriesPoint } from '../lib/api';
import { ROUTES } from '../lib/routes';
import { fmt } from '../lib/formatters';
import PageShell from '../components/shared/PageShell';
import SpendRevenueChart from '../components/charts/SpendRevenueChart';
import MetricSparkline from '../components/charts/MetricSparkline';

const WORKSPACES = [
  { label: 'Attribution', desc: 'Campaign performance & ROI tracking', icon: 'target', path: ROUTES.ATTRIBUTION, metric: 'roas' as const },
  { label: 'Source / Medium', desc: 'Traffic source breakdown', icon: 'link', path: ROUTES.SOURCE_MEDIUM, metric: 'spend' as const },
  { label: 'Website Performance', desc: 'CTR, CPC & landing page metrics', icon: 'zap', path: ROUTES.WEBSITE_PERFORMANCE, metric: 'ctr' as const },
  { label: 'Conversion Funnel', desc: 'Impressions to order flow', icon: 'funnel', path: ROUTES.WEBSITE_FUNNEL, metric: 'conversions' as const },
  { label: 'Cost Settings', desc: 'COGS, shipping & handling costs', icon: 'dollar', path: ROUTES.COST_SETTINGS, metric: 'spend' as const },
  { label: 'Connections', desc: 'Manage data sources', icon: 'plug', path: ROUTES.CONNECTIONS, metric: null },
];

const ICON_MAP: Record<string, string> = {
  target: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71',
  zap: 'M13 2L3 14h9l-1 10 10-12h-9l1-10z',
  funnel: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  plug: 'M12 22v-5M9 8V2M15 8V2M6 8h12a2 2 0 012 2v1a6 6 0 01-6 6h-4a6 6 0 01-6-6v-1a2 2 0 012-2z',
};

export default function SummaryDashboard() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);
  const { data, summary, refreshing, refresh } = useMetrics(undefined, undefined, handleUnauthorized);
  const navigate = useNavigate();

  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [tsLoading, setTsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setTsLoading(true);
    fetchTimeseries('7d')
      .then((ts) => {
        if (!cancelled) setTimeseries(ts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const roiColor = summary
    ? summary.total_roi >= 2 ? 'text-ats-green' : summary.total_roi >= 1 ? 'text-ats-yellow' : 'text-ats-red'
    : 'text-ats-text';

  const profit = summary ? summary.total_revenue - summary.total_spend : 0;
  const profitColor = profit >= 0 ? 'text-ats-green' : 'text-ats-red';

  const chartData = useMemo(
    () => timeseries.map((t) => ({ date: t.date, spend: t.spend, revenue: t.revenue })),
    [timeseries],
  );

  // Compute workspace live stats from metrics data
  const workspaceStats = useMemo(() => {
    if (!data.length) return null;
    const totalSpend = data.reduce((s, r) => s + r.spend, 0);
    const totalRevenue = data.reduce((s, r) => s + r.revenue, 0);
    const totalConversions = data.reduce((s, r) => s + r.conversions, 0);
    const avgCtr = data.reduce((s, r) => s + r.ctr, 0) / data.length;
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    return {
      roas: fmt.ratio(avgRoas),
      spend: fmt.currency(totalSpend),
      ctr: fmt.pctRaw(avgCtr),
      conversions: fmt.num(totalConversions),
    };
  }, [data]);

  // Sparkline data from timeseries
  const spendSpark = useMemo(() => timeseries.map((t) => t.spend), [timeseries]);
  const revenueSpark = useMemo(() => timeseries.map((t) => t.revenue), [timeseries]);
  const conversionSpark = useMemo(() => timeseries.map((t) => t.conversions), [timeseries]);

  // Recent activity: derive from timeseries changes
  const recentActivity = useMemo(() => {
    const items: { text: string; time: string; type: 'info' | 'success' | 'warning' }[] = [];
    if (timeseries.length >= 2) {
      const latest = timeseries[timeseries.length - 1];
      const prev = timeseries[timeseries.length - 2];
      const revChange = prev.revenue > 0 ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : 0;
      const spendChange = prev.spend > 0 ? ((latest.spend - prev.spend) / prev.spend) * 100 : 0;

      items.push({
        text: `Revenue ${revChange >= 0 ? 'increased' : 'decreased'} ${Math.abs(revChange).toFixed(1)}% day-over-day`,
        time: latest.date,
        type: revChange >= 0 ? 'success' : 'warning',
      });
      items.push({
        text: `Ad spend ${spendChange >= 0 ? 'increased' : 'decreased'} ${Math.abs(spendChange).toFixed(1)}% day-over-day`,
        time: latest.date,
        type: spendChange <= 0 ? 'success' : 'info',
      });
      if (latest.roas < 1) {
        items.push({
          text: `ROAS dropped below break-even (${latest.roas.toFixed(2)}x)`,
          time: latest.date,
          type: 'warning',
        });
      }
    }
    if (data.length > 0) {
      const topOffer = [...data].sort((a, b) => b.revenue - a.revenue)[0];
      items.push({
        text: `Top performer: ${topOffer.offer_name} (${fmt.currency(topOffer.revenue)} revenue)`,
        time: 'Current',
        type: 'info',
      });
      const lowRoas = data.filter((r) => r.spend > 0 && r.revenue / r.spend < 1);
      if (lowRoas.length > 0) {
        items.push({
          text: `${lowRoas.length} campaign${lowRoas.length > 1 ? 's' : ''} below break-even ROAS`,
          time: 'Current',
          type: 'warning',
        });
      }
    }
    return items;
  }, [timeseries, data]);

  const activityDotColor = (type: 'info' | 'success' | 'warning') => {
    if (type === 'success') return 'bg-ats-green';
    if (type === 'warning') return 'bg-ats-yellow';
    return 'bg-ats-accent';
  };

  return (
    <PageShell
      title="Command Center"
      subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      actions={
        <button
          onClick={() => refresh()}
          disabled={refreshing}
          className="bg-ats-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
        >
          {refreshing ? 'Syncing...' : 'Refresh'}
        </button>
      }
    >
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Spend</div>
            <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(summary.total_spend)}</div>
            {spendSpark.length > 0 && (
              <div className="mt-2">
                <MetricSparkline data={spendSpark} color="#ef4444" height={28} />
              </div>
            )}
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Revenue</div>
            <div className="text-2xl font-bold text-ats-green font-mono">{fmt.currency(summary.total_revenue)}</div>
            {revenueSpark.length > 0 && (
              <div className="mt-2">
                <MetricSparkline data={revenueSpark} color="#22c55e" height={28} />
              </div>
            )}
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">ROAS</div>
            <div className={`text-2xl font-bold font-mono ${roiColor}`}>{fmt.ratio(summary.total_roi)}</div>
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Conversions</div>
            <div className="text-2xl font-bold text-ats-text font-mono">{fmt.num(summary.total_conversions)}</div>
            {conversionSpark.length > 0 && (
              <div className="mt-2">
                <MetricSparkline data={conversionSpark} color="#3b82f6" height={28} />
              </div>
            )}
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Net Profit</div>
            <div className={`text-2xl font-bold font-mono ${profitColor}`}>{fmt.currency(profit)}</div>
          </div>
        </div>
      )}

      {/* Spend vs Revenue Chart */}
      <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-8">
        <h2 className="text-sm font-semibold text-ats-text mb-3">Spend vs Revenue (7-day)</h2>
        {tsLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-ats-text-muted text-sm">Loading chart...</div>
          </div>
        ) : (
          <SpendRevenueChart data={chartData} />
        )}
      </div>

      {/* Workspace Quick Links */}
      <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Workspaces</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.path}
            onClick={() => navigate(ws.path)}
            className="bg-ats-card border border-ats-border rounded-xl p-4 text-left hover:bg-ats-hover hover:border-ats-text-muted/30 transition-colors group"
          >
            <div className="flex items-start justify-between mb-2">
              <svg className="w-5 h-5 text-ats-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON_MAP[ws.icon] || ICON_MAP.target} />
              </svg>
              {ws.metric && workspaceStats && (
                <span className="text-xs font-mono text-ats-text-muted bg-ats-bg px-2 py-0.5 rounded">
                  {workspaceStats[ws.metric as keyof typeof workspaceStats]}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-ats-text group-hover:text-ats-accent transition-colors">{ws.label}</div>
            <div className="text-xs text-ats-text-muted mt-0.5">{ws.desc}</div>
          </button>
        ))}
      </div>

      {/* Recent Activity */}
      <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Recent Activity</h2>
      <div className="bg-ats-card rounded-xl border border-ats-border divide-y divide-ats-border">
        {recentActivity.length === 0 ? (
          <div className="p-6 text-center text-sm text-ats-text-muted">
            No recent activity. Data will appear after sync.
          </div>
        ) : (
          recentActivity.map((item, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${activityDotColor(item.type)}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ats-text">{item.text}</div>
                <div className="text-[11px] text-ats-text-muted mt-0.5">{item.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </PageShell>
  );
}
