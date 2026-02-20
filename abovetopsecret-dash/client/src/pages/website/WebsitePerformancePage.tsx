import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { fetchMetrics, fetchTimeseries, MetricRow, TimeseriesPoint } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import MetricSparkline from '../../components/charts/MetricSparkline';

export default function WebsitePerformancePage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [metricsData, tsData] = await Promise.all([
        fetchMetrics(),
        fetchTimeseries(period),
      ]);
      setMetrics(metricsData);
      setTimeseries(tsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    if (!metrics.length) return null;
    const totalSpend = metrics.reduce((s, r) => s + r.spend, 0);
    const count = metrics.length;
    return {
      avgCtr: metrics.reduce((s, r) => s + r.ctr, 0) / count,
      avgCpc: metrics.reduce((s, r) => s + r.cpc, 0) / count,
      avgCpm: metrics.reduce((s, r) => s + r.cpm, 0) / count,
      avgLpCtr: metrics.reduce((s, r) => s + r.lp_ctr, 0) / count,
      totalSpend,
      totalClicks: metrics.reduce((s, r) => {
        // Estimate clicks from CPC: clicks = spend / cpc
        return s + (r.cpc > 0 ? r.spend / r.cpc : 0);
      }, 0),
      totalImpressions: metrics.reduce((s, r) => {
        // Estimate impressions from CPM: impressions = (spend / cpm) * 1000
        return s + (r.cpm > 0 ? (r.spend / r.cpm) * 1000 : 0);
      }, 0),
    };
  }, [metrics]);

  // Chart data: clicks and impressions over time
  const chartData = useMemo(
    () => timeseries.map((t) => ({
      date: t.date,
      clicks: t.clicks,
      impressions: t.impressions,
    })),
    [timeseries],
  );

  // Sparkline data
  const clicksSpark = useMemo(() => timeseries.map((t) => t.clicks), [timeseries]);
  const impressionsSpark = useMemo(() => timeseries.map((t) => t.impressions), [timeseries]);

  // Performance table by ad set (offer_name + account_name)
  const tableData = useMemo(() => {
    return metrics.map((row) => ({
      offer: row.offer_name,
      account: row.account_name,
      spend: row.spend,
      ctr: row.ctr,
      cpc: row.cpc,
      cpm: row.cpm,
      lp_ctr: row.lp_ctr,
      cvr: row.cvr,
      conversions: row.conversions,
      revenue: row.revenue,
      // Estimated values
      clicks: row.cpc > 0 ? row.spend / row.cpc : 0,
      impressions: row.cpm > 0 ? (row.spend / row.cpm) * 1000 : 0,
    }));
  }, [metrics]);

  const sortedTable = useMemo(() => {
    return [...tableData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortCol];
      const bVal = (b as Record<string, unknown>)[sortCol];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [tableData, sortCol, sortDir]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }, [sortCol]);

  const sortArrow = (col: string) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const thCls = "px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted cursor-pointer hover:text-ats-text transition-colors select-none whitespace-nowrap";
  const tdCls = "px-3 py-2.5 text-sm font-mono whitespace-nowrap";

  return (
    <PageShell
      title="Website Performance"
      subtitle="CTR, CPC, CPM and landing page metrics"
      actions={
        <div className="flex items-center gap-2">
          {['7d', '14d', '30d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                period === p
                  ? 'bg-ats-accent text-white'
                  : 'bg-ats-border text-ats-text-muted hover:bg-ats-hover'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      }
    >
      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-5 text-ats-red text-sm">{error}</div>
      )}

      {!loading && !error && kpis && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg CTR</div>
              <div className="text-2xl font-bold text-ats-accent font-mono">{fmt.pctRaw(kpis.avgCtr)}</div>
              {clicksSpark.length > 0 && (
                <div className="mt-2">
                  <MetricSparkline data={clicksSpark} color="#3b82f6" height={24} />
                </div>
              )}
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg CPC</div>
              <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(kpis.avgCpc)}</div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg CPM</div>
              <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(kpis.avgCpm)}</div>
              {impressionsSpark.length > 0 && (
                <div className="mt-2">
                  <MetricSparkline data={impressionsSpark} color="#8b5cf6" height={24} />
                </div>
              )}
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg LP CTR</div>
              <div className="text-2xl font-bold text-ats-green font-mono">{fmt.pctRaw(kpis.avgLpCtr)}</div>
            </div>
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-ats-card rounded-xl p-3 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Est. Clicks</div>
              <div className="text-lg font-bold text-ats-text font-mono">{fmt.num(Math.round(kpis.totalClicks))}</div>
            </div>
            <div className="bg-ats-card rounded-xl p-3 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Est. Impressions</div>
              <div className="text-lg font-bold text-ats-text font-mono">{fmt.num(Math.round(kpis.totalImpressions))}</div>
            </div>
            <div className="bg-ats-card rounded-xl p-3 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Ad Sets</div>
              <div className="text-lg font-bold text-ats-text font-mono">{metrics.length}</div>
            </div>
          </div>

          {/* Clicks & Impressions Chart */}
          <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6">
            <h3 className="text-sm font-semibold text-ats-text mb-3">Clicks & Impressions Over Time</h3>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">No timeseries data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradImpressions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#374151' }}
                  />
                  <YAxis
                    yAxisId="clicks"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                  />
                  <YAxis
                    yAxisId="impressions"
                    orientation="right"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: 12,
                    }}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value != null ? value.toLocaleString() : '0',
                      name ? name.charAt(0).toUpperCase() + name.slice(1) : '',
                    ]}
                    labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-xs text-ats-text-muted capitalize">{value}</span>
                    )}
                  />
                  <Area
                    yAxisId="clicks"
                    type="monotone"
                    dataKey="clicks"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradClicks)"
                  />
                  <Area
                    yAxisId="impressions"
                    type="monotone"
                    dataKey="impressions"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#gradImpressions)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Performance Table */}
          <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
            <div className="px-4 py-3 border-b border-ats-border">
              <h3 className="text-sm font-semibold text-ats-text">Performance by Ad Set</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ats-border bg-ats-bg/50">
                    <th className={thCls} onClick={() => handleSort('offer')}>Offer{sortArrow('offer')}</th>
                    <th className={thCls} onClick={() => handleSort('account')}>Account{sortArrow('account')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('spend')}>Spend{sortArrow('spend')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('ctr')}>CTR{sortArrow('ctr')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('cpc')}>CPC{sortArrow('cpc')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('cpm')}>CPM{sortArrow('cpm')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('lp_ctr')}>LP CTR{sortArrow('lp_ctr')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('cvr')}>CVR{sortArrow('cvr')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('conversions')}>Conv{sortArrow('conversions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-ats-text-muted text-sm">
                        No performance data available
                      </td>
                    </tr>
                  ) : (
                    sortedTable.map((row, i) => (
                      <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50 transition-colors">
                        <td className={`${tdCls} text-ats-text font-semibold max-w-[150px] truncate`}>{row.offer}</td>
                        <td className={`${tdCls} text-ats-text-muted max-w-[120px] truncate`}>{row.account}</td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.spend)}</td>
                        <td className={`${tdCls} text-right ${row.ctr >= 2 ? 'text-ats-green' : row.ctr >= 1 ? 'text-ats-yellow' : 'text-ats-red'}`}>
                          {fmt.pctRaw(row.ctr)}
                        </td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.cpc)}</td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.cpm)}</td>
                        <td className={`${tdCls} text-right ${row.lp_ctr >= 30 ? 'text-ats-green' : row.lp_ctr >= 15 ? 'text-ats-yellow' : 'text-ats-red'}`}>
                          {fmt.pctRaw(row.lp_ctr)}
                        </td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.pctRaw(row.cvr)}</td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.num(row.conversions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
