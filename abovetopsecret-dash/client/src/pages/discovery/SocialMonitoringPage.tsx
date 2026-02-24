import { useState, useEffect, useCallback } from 'react';
import { fetchMetrics, fetchBreakdown, MetricRow, BreakdownItem } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import PieBreakdown from '../../components/charts/PieBreakdown';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

type SortKey = 'label' | 'spend' | 'revenue' | 'conversions' | 'roas';
type SortDir = 'asc' | 'desc';

export default function SocialMonitoringPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadData = useCallback(async () => {
    try {
      const [metricsData, breakdownData] = await Promise.all([
        fetchMetrics(),
        fetchBreakdown('campaign'),
      ]);
      setMetrics(metricsData);
      setBreakdown(breakdownData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useLiveRefresh(loadData);

  // Compute summary stats
  const totalSpend = breakdown.reduce((sum, b) => sum + b.spend, 0);
  const totalRevenue = breakdown.reduce((sum, b) => sum + b.revenue, 0);
  const totalConversions = breakdown.reduce((sum, b) => sum + b.conversions, 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Sorted campaigns
  const sortedBreakdown = [...breakdown].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    if (sortKey === 'label') {
      aVal = a.label.toLowerCase();
      bVal = b.label.toLowerCase();
    } else if (sortKey === 'roas') {
      aVal = a.spend > 0 ? a.revenue / a.spend : 0;
      bVal = b.spend > 0 ? b.revenue / b.spend : 0;
    } else {
      aVal = a[sortKey];
      bVal = b[sortKey];
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Top/bottom performers by ROAS
  const withRoas = breakdown
    .filter((b) => b.spend > 0)
    .map((b) => ({ ...b, roas: b.revenue / b.spend }));
  const topPerformers = [...withRoas].sort((a, b) => b.roas - a.roas).slice(0, 5);
  const bottomPerformers = [...withRoas].sort((a, b) => a.roas - b.roas).slice(0, 5);

  // Pie data
  const spendPie = breakdown
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map((b) => ({ name: b.label, value: b.spend }));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ^' : ' v';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <PageShell title="Social Monitoring" showDatePicker subtitle="Campaign Performance Breakdowns">
        <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Social Monitoring" showDatePicker subtitle="Campaign performance breakdowns">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Spend</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(totalSpend)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-ats-green font-mono">{fmt.currency(totalRevenue)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg ROAS</div>
          <div className={`text-2xl font-bold font-mono ${avgRoas >= 2 ? 'text-ats-green' : avgRoas >= 1 ? 'text-ats-yellow' : 'text-ats-red'}`}>
            {fmt.ratio(avgRoas)}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Conversions</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{fmt.num(totalConversions)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Spend Distribution Pie */}
        <div className="bg-ats-card border border-ats-border rounded-lg p-4">
          <PieBreakdown data={spendPie} title="Spend Distribution by Campaign" />
        </div>

        {/* Top/Bottom Performers */}
        <div className="grid grid-rows-2 gap-4">
          <div className="bg-ats-card border border-ats-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-ats-text mb-3">Top Performers (ROAS)</h3>
            <div className="space-y-2">
              {topPerformers.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-ats-text truncate flex-1 mr-2">{item.label}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-ats-text-muted">{fmt.currency(item.spend)}</span>
                    <span className="text-ats-green font-semibold font-mono">{fmt.ratio(item.roas)}</span>
                  </div>
                </div>
              ))}
              {topPerformers.length === 0 && (
                <p className="text-xs text-ats-text-muted">No data available</p>
              )}
            </div>
          </div>

          <div className="bg-ats-card border border-ats-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-ats-text mb-3">Bottom Performers (ROAS)</h3>
            <div className="space-y-2">
              {bottomPerformers.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-ats-text truncate flex-1 mr-2">{item.label}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-ats-text-muted">{fmt.currency(item.spend)}</span>
                    <span className="text-ats-red font-semibold font-mono">{fmt.ratio(item.roas)}</span>
                  </div>
                </div>
              ))}
              {bottomPerformers.length === 0 && (
                <p className="text-xs text-ats-text-muted">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="bg-ats-card border border-ats-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ats-border">
          <h3 className="text-sm font-bold text-ats-text">All Campaigns</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border text-ats-text-muted">
                {([
                  ['label', 'Campaign'],
                  ['spend', 'Spend'],
                  ['revenue', 'Revenue'],
                  ['conversions', 'Conversions'],
                  ['roas', 'ROAS'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-ats-text transition-colors select-none"
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedBreakdown.map((item, i) => {
                const roas = item.spend > 0 ? item.revenue / item.spend : 0;
                return (
                  <tr key={i} className="border-b border-ats-border/50 hover:bg-ats-hover">
                    <td className="px-4 py-2.5 text-ats-text font-medium truncate max-w-[300px]">
                      {item.label}
                    </td>
                    <td className="px-4 py-2.5 text-ats-text font-mono">{fmt.currency(item.spend)}</td>
                    <td className="px-4 py-2.5 text-ats-green font-mono">{fmt.currency(item.revenue)}</td>
                    <td className="px-4 py-2.5 text-ats-text font-mono">{fmt.num(item.conversions)}</td>
                    <td className="px-4 py-2.5 font-mono">
                      <span className={roas >= 2 ? 'text-ats-green' : roas >= 1 ? 'text-ats-yellow' : 'text-ats-red'}>
                        {fmt.ratio(roas)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sortedBreakdown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ats-text-muted">
                    No campaign data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
