import { useState, useEffect, useMemo } from 'react';
import { fetchTimeseries, TimeseriesPoint } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';

type MetricKey = 'revenue' | 'spend' | 'conversions' | 'roas' | 'clicks' | 'impressions';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'spend', label: 'Spend' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'roas', label: 'ROAS' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' },
];

function getIntensityColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgba(59, 130, 246, 0.3)';
  const ratio = (value - min) / (max - min);
  // Gradient from dim blue to bright green
  if (ratio < 0.25) return 'rgba(59, 130, 246, 0.15)';
  if (ratio < 0.5) return 'rgba(59, 130, 246, 0.35)';
  if (ratio < 0.75) return 'rgba(16, 185, 129, 0.4)';
  return 'rgba(16, 185, 129, 0.65)';
}

function formatValue(value: number, metric: MetricKey): string {
  switch (metric) {
    case 'revenue':
    case 'spend':
      return fmt.currency(value);
    case 'roas':
      return fmt.ratio(value);
    case 'conversions':
    case 'clicks':
    case 'impressions':
      return fmt.num(value);
    default:
      return value.toFixed(2);
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CohortAnalysisPage() {
  const [data, setData] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('revenue');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTimeseries('30d')
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load timeseries data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Compute min/max for the selected metric across all data points
  const { min, max } = useMemo(() => {
    if (!data.length) return { min: 0, max: 1 };
    const values = data.map((d) => d[selectedMetric] as number);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [data, selectedMetric]);

  // Retention-style derived data: day-over-day change percentages
  const retentionData = useMemo(() => {
    if (data.length < 2) return [];
    return data.slice(1).map((point, i) => {
      const prev = data[i];
      const metrics: Record<MetricKey, number> = {
        revenue: prev.revenue > 0 ? ((point.revenue - prev.revenue) / prev.revenue) * 100 : 0,
        spend: prev.spend > 0 ? ((point.spend - prev.spend) / prev.spend) * 100 : 0,
        conversions: prev.conversions > 0 ? ((point.conversions - prev.conversions) / prev.conversions) * 100 : 0,
        roas: prev.roas > 0 ? ((point.roas - prev.roas) / prev.roas) * 100 : 0,
        clicks: prev.clicks > 0 ? ((point.clicks - prev.clicks) / prev.clicks) * 100 : 0,
        impressions: prev.impressions > 0 ? ((point.impressions - prev.impressions) / prev.impressions) * 100 : 0,
      };
      return { date: point.date, ...metrics };
    });
  }, [data]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!data.length) return { total: 0, avg: 0, peak: 0, peakDate: '' };
    const values = data.map((d) => d[selectedMetric] as number);
    const total = values.reduce((s, v) => s + v, 0);
    const avg = total / values.length;
    const peakVal = Math.max(...values);
    const peakIdx = values.indexOf(peakVal);
    return {
      total,
      avg,
      peak: peakVal,
      peakDate: data[peakIdx]?.date || '',
    };
  }, [data, selectedMetric]);

  if (loading) {
    return (
      <PageShell title="Cohort Analysis" subtitle="Retention-style heatmap from timeseries data">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Cohort Analysis" subtitle="Retention-style heatmap from timeseries data">
        <div className="text-center py-10 text-ats-red text-sm">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Cohort Analysis"
      subtitle="Retention-style heatmap from 30-day timeseries data"
      actions={
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
          className="bg-ats-border text-ats-text px-3 py-2 rounded-lg text-xs border border-[#374151] outline-none focus:border-ats-accent"
        >
          {METRIC_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      }
    >
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total</div>
          <div className="text-xl font-bold text-ats-text font-mono">
            {formatValue(summaryStats.total, selectedMetric)}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Daily Avg</div>
          <div className="text-xl font-bold text-ats-text font-mono">
            {formatValue(summaryStats.avg, selectedMetric)}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Peak</div>
          <div className="text-xl font-bold text-ats-green font-mono">
            {formatValue(summaryStats.peak, selectedMetric)}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Peak Date</div>
          <div className="text-xl font-bold text-ats-text font-mono">
            {summaryStats.peakDate ? formatDate(summaryStats.peakDate) : '--'}
          </div>
        </div>
      </div>

      {/* Heatmap Grid — Absolute Values */}
      <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-ats-border">
          <h3 className="text-sm font-semibold text-ats-text">Daily Performance Heatmap</h3>
          <p className="text-xs text-ats-text-muted mt-0.5">
            Color intensity represents relative value — darker means higher
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium sticky left-0 bg-ats-card z-10">
                  Date
                </th>
                {METRIC_OPTIONS.map((opt) => (
                  <th
                    key={opt.key}
                    className={`text-right px-4 py-2.5 text-[11px] uppercase tracking-wider font-mono font-medium ${
                      opt.key === selectedMetric ? 'text-ats-accent' : 'text-ats-text-muted'
                    }`}
                  >
                    {opt.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point, i) => (
                <tr key={point.date} className={`border-b border-ats-border/50 ${i % 2 === 0 ? '' : 'bg-ats-row-alt/50'}`}>
                  <td className="px-4 py-2 text-ats-text font-mono text-xs sticky left-0 bg-ats-card z-10 whitespace-nowrap">
                    {formatDate(point.date)}
                  </td>
                  {METRIC_OPTIONS.map((opt) => {
                    const val = point[opt.key] as number;
                    const allVals = data.map((d) => d[opt.key] as number);
                    const metricMin = Math.min(...allVals);
                    const metricMax = Math.max(...allVals);
                    return (
                      <td
                        key={opt.key}
                        className="px-4 py-2 text-right font-mono text-xs text-ats-text"
                        style={{ backgroundColor: getIntensityColor(val, metricMin, metricMax) }}
                      >
                        {formatValue(val, opt.key)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ats-text-muted">
                    No timeseries data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Day-over-Day Change Grid */}
      <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
        <div className="px-4 py-3 border-b border-ats-border">
          <h3 className="text-sm font-semibold text-ats-text">Day-over-Day Change (%)</h3>
          <p className="text-xs text-ats-text-muted mt-0.5">
            Retention-style view showing percentage change from previous day
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium sticky left-0 bg-ats-card z-10">
                  Date
                </th>
                {METRIC_OPTIONS.map((opt) => (
                  <th
                    key={opt.key}
                    className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium"
                  >
                    {opt.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retentionData.map((point, i) => (
                <tr key={point.date} className={`border-b border-ats-border/50 ${i % 2 === 0 ? '' : 'bg-ats-row-alt/50'}`}>
                  <td className="px-4 py-2 text-ats-text font-mono text-xs sticky left-0 bg-ats-card z-10 whitespace-nowrap">
                    {formatDate(point.date)}
                  </td>
                  {METRIC_OPTIONS.map((opt) => {
                    const val = point[opt.key] as number;
                    const color = val > 5 ? 'text-ats-green' : val < -5 ? 'text-ats-red' : 'text-ats-text-muted';
                    const bgColor = val > 10
                      ? 'rgba(16, 185, 129, 0.15)'
                      : val < -10
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'transparent';
                    return (
                      <td
                        key={opt.key}
                        className={`px-4 py-2 text-right font-mono text-xs ${color}`}
                        style={{ backgroundColor: bgColor }}
                      >
                        {val > 0 ? '+' : ''}{val.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
              {retentionData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ats-text-muted">
                    Not enough data for day-over-day analysis
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap legend */}
      <div className="flex items-center justify-center gap-4 mt-4 mb-2">
        <span className="text-[10px] text-ats-text-muted font-mono">Low</span>
        <div className="flex gap-0.5">
          {['rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.35)', 'rgba(16, 185, 129, 0.4)', 'rgba(16, 185, 129, 0.65)'].map((color, i) => (
            <div key={i} className="w-8 h-3 rounded-sm" style={{ backgroundColor: color }} />
          ))}
        </div>
        <span className="text-[10px] text-ats-text-muted font-mono">High</span>
      </div>

      <div className="text-center pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {data.length} days loaded · 30-day window
        </div>
      </div>
    </PageShell>
  );
}
