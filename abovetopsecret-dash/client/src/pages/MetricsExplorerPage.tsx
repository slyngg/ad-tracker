import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ScatterChart as ScatterChartIcon, RefreshCw, Info } from 'lucide-react';
import PageShell from '../components/shared/PageShell';
import { getAuthToken } from '../stores/authStore';
import { useChartTheme } from '../hooks/useChartTheme';

// ── Types ───────────────────────────────────────────────────────

interface MetricDef {
  key: string;
  label: string;
  description: string;
  category: string;
  format: 'currency' | 'number' | 'ratio' | 'percentage';
}

interface CorrelationPoint {
  date: string;
  x: number;
  y: number;
}

type CorrelationStrength =
  | 'strong_positive'
  | 'moderate_positive'
  | 'weak_positive'
  | 'none'
  | 'weak_negative'
  | 'moderate_negative'
  | 'strong_negative';

interface CorrelationResult {
  points: CorrelationPoint[];
  pearsonR: number;
  pValue: number;
  slope: number;
  intercept: number;
  interpretation: CorrelationStrength;
  interpretationText: string;
}

// ── API Helper ──────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMetricValue(value: number, format: MetricDef['format']): string {
  switch (format) {
    case 'currency': return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'ratio': return `${value.toFixed(2)}x`;
    case 'percentage': return `${value.toFixed(1)}%`;
    default: return Math.round(value).toLocaleString();
  }
}

function strengthBadge(strength: CorrelationStrength): { color: string; bg: string; label: string } {
  switch (strength) {
    case 'strong_positive': return { color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', label: 'Strong Positive' };
    case 'moderate_positive': return { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', label: 'Moderate Positive' };
    case 'weak_positive': return { color: 'text-amber-300', bg: 'bg-amber-300/10 border-amber-300/20', label: 'Weak Positive' };
    case 'none': return { color: 'text-gray-400', bg: 'bg-gray-400/10 border-gray-400/20', label: 'No Correlation' };
    case 'weak_negative': return { color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20', label: 'Weak Negative' };
    case 'moderate_negative': return { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', label: 'Moderate Negative' };
    case 'strong_negative': return { color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20', label: 'Strong Negative' };
  }
}

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // yesterday
  const start = new Date(end);
  start.setDate(start.getDate() - 29); // 30 day window
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

// ── Component ───────────────────────────────────────────────────

export default function MetricsExplorerPage() {
  const ct = useChartTheme();
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [metricX, setMetricX] = useState('meta_spend');
  const [metricY, setMetricY] = useState('total_revenue');
  const dates = defaultDateRange();
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available metrics on mount
  useEffect(() => {
    apiFetch<MetricDef[]>('/metrics/correlation/available')
      .then(setMetrics)
      .catch(() => {});
  }, []);

  const loadCorrelation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CorrelationResult>(
        `/metrics/correlation?x=${metricX}&y=${metricY}&start=${startDate}&end=${endDate}&granularity=day`,
      );
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [metricX, metricY, startDate, endDate]);

  // Auto-load when params change
  useEffect(() => {
    if (metricX && metricY && startDate && endDate) {
      loadCorrelation();
    }
  }, [loadCorrelation]);

  const xMetric = useMemo(() => metrics.find((m) => m.key === metricX), [metrics, metricX]);
  const yMetric = useMemo(() => metrics.find((m) => m.key === metricY), [metrics, metricY]);

  // Group metrics by category for the dropdown
  const groupedMetrics = useMemo(() => {
    const groups: Record<string, MetricDef[]> = {};
    for (const m of metrics) {
      (groups[m.category] ??= []).push(m);
    }
    return groups;
  }, [metrics]);

  // Regression line data (two endpoints)
  const regressionLine = useMemo(() => {
    if (!result || result.points.length < 2) return null;
    const xs = result.points.map((p) => p.x).filter((x) => x !== 0 || result.points.some((p) => p.y !== 0));
    if (xs.length < 2) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return [
      { x: minX, y: result.slope * minX + result.intercept },
      { x: maxX, y: result.slope * maxX + result.intercept },
    ];
  }, [result]);

  const cardCls = 'bg-ats-card border border-ats-border rounded-2xl p-6';
  const selectCls = 'bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-full';
  const inputCls = 'bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  const badge = result ? strengthBadge(result.interpretation) : null;

  return (
    <PageShell title="Metrics Explorer" subtitle="Discover correlations between any two metrics">
      {/* Top Controls */}
      <div className={`${cardCls} mb-6`}>
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          {/* X Axis */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">X Axis</label>
            <select value={metricX} onChange={(e) => setMetricX(e.target.value)} className={selectCls}>
              {Object.entries(groupedMetrics).map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Y Axis */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">Y Axis</label>
            <select value={metricY} onChange={(e) => setMetricY(e.target.value)} className={selectCls}>
              {Object.entries(groupedMetrics).map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">End</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={loadCorrelation}
            disabled={loading}
            className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Analyze
          </button>
        </div>
        {startDate && endDate && (
          <div className="mt-3 text-xs text-ats-text-muted">
            {daysBetween(startDate, endDate)} days selected
          </div>
        )}
      </div>

      {/* Loading / Error States */}
      {loading && !result && (
        <div className={`${cardCls} mb-6`}>
          <div className="h-[350px] flex items-center justify-center">
            <div className="text-sm text-ats-text-muted animate-pulse">Analyzing correlation...</div>
          </div>
        </div>
      )}

      {error && (
        <div className={`${cardCls} mb-6 border-red-500/30`}>
          <div className="text-sm text-red-400">{error}</div>
        </div>
      )}

      {/* Scatter Plot */}
      {result && (
        <>
          <div className={`${cardCls} mb-6`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ats-text flex items-center gap-2">
                  <ScatterChartIcon className="w-4 h-4 text-blue-400" />
                  {xMetric?.label ?? metricX} vs {yMetric?.label ?? metricY}
                </h3>
                <p className="text-xs text-ats-text-muted mt-0.5">Each point represents one day</p>
              </div>
              {badge && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg} ${badge.color}`}>
                  r = {result.pearsonR.toFixed(2)}
                </span>
              )}
            </div>

            <div className="h-[350px] sm:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={xMetric?.label ?? metricX}
                    tick={{ fill: ct.axisText, fontSize: 11 }}
                    tickFormatter={(v: number) => xMetric ? formatMetricValue(v, xMetric.format) : String(v)}
                    label={{ value: xMetric?.label ?? metricX, position: 'insideBottom', offset: -10, fill: ct.axisText, fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={yMetric?.label ?? metricY}
                    tick={{ fill: ct.axisText, fontSize: 11 }}
                    tickFormatter={(v: number) => yMetric ? formatMetricValue(v, yMetric.format) : String(v)}
                    label={{ value: yMetric?.label ?? metricY, angle: -90, position: 'insideLeft', offset: 10, fill: ct.axisText, fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0]?.payload as CorrelationPoint | undefined;
                      if (!data) return null;
                      return (
                        <div className="bg-[#1f2937] border border-[#374151] rounded-lg p-3 shadow-lg">
                          <div className="text-xs text-gray-400 mb-1">{formatDate(data.date)}</div>
                          <div className="text-sm text-white">
                            <span className="text-blue-400">{xMetric?.label}:</span>{' '}
                            {xMetric ? formatMetricValue(data.x, xMetric.format) : data.x}
                          </div>
                          <div className="text-sm text-white">
                            <span className="text-emerald-400">{yMetric?.label}:</span>{' '}
                            {yMetric ? formatMetricValue(data.y, yMetric.format) : data.y}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={result.points}
                    fill="#2d7ff9"
                    fillOpacity={0.8}
                    r={5}
                  />
                  {/* Regression Line */}
                  {regressionLine && regressionLine.length === 2 && (
                    <ReferenceLine
                      segment={[
                        { x: regressionLine[0].x, y: regressionLine[0].y },
                        { x: regressionLine[1].x, y: regressionLine[1].y },
                      ]}
                      stroke="#00d68f"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      ifOverflow="extendDomain"
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stats Panel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className={cardCls}>
              <div className="text-xs text-ats-text-muted uppercase font-mono mb-1">Pearson r</div>
              <div className={`text-2xl font-bold font-mono ${badge?.color ?? 'text-ats-text'}`}>
                {result.pearsonR.toFixed(3)}
              </div>
            </div>
            <div className={cardCls}>
              <div className="text-xs text-ats-text-muted uppercase font-mono mb-1">P-Value</div>
              <div className="text-2xl font-bold font-mono text-ats-text">
                {result.pValue < 0.001 ? '<0.001' : result.pValue.toFixed(3)}
              </div>
              <div className="text-xs text-ats-text-muted mt-1">
                {result.pValue < 0.05 ? 'Statistically significant' : 'Not significant'}
              </div>
            </div>
            <div className={cardCls}>
              <div className="text-xs text-ats-text-muted uppercase font-mono mb-1">Correlation</div>
              {badge && (
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${badge.bg} ${badge.color}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <div className={cardCls}>
              <div className="text-xs text-ats-text-muted uppercase font-mono mb-1">Data Points</div>
              <div className="text-2xl font-bold font-mono text-ats-text">
                {result.points.length}
              </div>
              <div className="text-xs text-ats-text-muted mt-1">
                {result.points.filter((p) => p.x !== 0 || p.y !== 0).length} non-zero
              </div>
            </div>
          </div>

          {/* Slope Interpretation */}
          {Math.abs(result.pearsonR) >= 0.3 && result.slope !== 0 && xMetric && yMetric && (
            <div className={`${cardCls} mb-6`}>
              <h3 className="text-sm font-semibold text-ats-text mb-2">Slope Analysis</h3>
              <div className="text-sm text-ats-text-muted">
                <span className="text-blue-400 font-medium">Slope: {result.slope.toFixed(4)}</span>
                <span className="mx-2 text-ats-border">|</span>
                <span className="text-gray-400">Intercept: {formatMetricValue(result.intercept, yMetric.format)}</span>
              </div>
              <p className="text-sm text-ats-text mt-2">
                For every{' '}
                <span className="text-blue-400 font-medium">{formatMetricValue(100, xMetric.format)}</span>{' '}
                increase in {xMetric.label}, {yMetric.label}{' '}
                {result.slope > 0 ? 'increases' : 'decreases'} by approximately{' '}
                <span className="text-emerald-400 font-medium">{formatMetricValue(Math.abs(result.slope * 100), yMetric.format)}</span>.
              </p>
            </div>
          )}

          {/* Jarvis Interpretation Box */}
          <div className={`${cardCls} border-blue-500/20 bg-gradient-to-br from-ats-card to-blue-950/20`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ats-text mb-2">Analysis Summary</h3>
                <p className="text-sm text-ats-text-muted leading-relaxed">
                  {result.interpretationText}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!result && !loading && !error && (
        <div className={`${cardCls} text-center py-16`}>
          <ScatterChartIcon className="w-12 h-12 text-ats-text-muted mx-auto mb-4 opacity-40" />
          <h3 className="text-lg font-bold text-ats-text mb-2">Explore Metric Correlations</h3>
          <p className="text-sm text-ats-text-muted max-w-md mx-auto">
            Select two metrics above and a date range to discover how they relate to each other.
            The scatter plot will show daily data points with a regression line overlay.
          </p>
        </div>
      )}
    </PageShell>
  );
}
