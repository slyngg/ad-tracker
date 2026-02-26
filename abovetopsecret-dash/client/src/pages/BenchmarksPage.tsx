import { useState, useEffect, useCallback } from 'react';
import {
  Target, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  ChevronDown, Save, X, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Percent, ShoppingCart,
} from 'lucide-react';
import PageShell from '../components/shared/PageShell';
import { getAuthToken } from '../stores/authStore';

// ─── API helpers ──────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────

interface Benchmark {
  metric: string;
  threshold_green: number | null;
  threshold_amber: number | null;
  auto_computed: boolean;
  last_computed: string | null;
}

interface Stoplight {
  id: number;
  platform: string;
  campaign_id: string;
  campaign_name: string | null;
  signal: 'scale' | 'watch' | 'cut';
  roas: number | null;
  cpa: number | null;
  ncpa: number | null;
  spend: number | null;
  revenue: number | null;
  computed_at: string;
}

interface StoplightSummary {
  scale: number;
  watch: number;
  cut: number;
}

// ─── Constants ────────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; format: (v: number) => string; lowerBetter?: boolean }> = {
  roas: { label: 'ROAS', icon: TrendingUp, format: (v) => `${v.toFixed(2)}x` },
  cpa: { label: 'CPA', icon: DollarSign, format: (v) => `$${v.toFixed(2)}`, lowerBetter: true },
  ncpa: { label: 'nCPA', icon: ShoppingCart, format: (v) => `$${v.toFixed(2)}`, lowerBetter: true },
  mer: { label: 'MER', icon: Activity, format: (v) => `${v.toFixed(2)}x` },
  aov: { label: 'AOV', icon: BarChart3, format: (v) => `$${v.toFixed(2)}` },
  profit_margin: { label: 'Profit Margin', icon: Percent, format: (v) => `${v.toFixed(1)}%` },
};

const SIGNAL_STYLES: Record<string, { bg: string; text: string; dot: string; label: string; rowBg: string }> = {
  scale: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: 'Scale',
    rowBg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
  },
  watch: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    label: 'Watch',
    rowBg: 'bg-amber-500/5 hover:bg-amber-500/10',
  },
  cut: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Cut',
    rowBg: 'bg-red-500/5 hover:bg-red-500/10',
  },
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  newsbreak: 'NewsBreak',
};

// ─── Components ───────────────────────────────────────────────────

function SignalDot({ signal }: { signal: string }) {
  const style = SIGNAL_STYLES[signal] || SIGNAL_STYLES.watch;
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${style.dot}`} />
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const style = SIGNAL_STYLES[signal] || SIGNAL_STYLES.watch;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function BenchmarkCard({
  benchmark,
  onEdit,
}: {
  benchmark: Benchmark;
  onEdit: (metric: string, green: number, amber: number) => void;
}) {
  const config = METRIC_CONFIG[benchmark.metric];
  if (!config) return null;

  const [editing, setEditing] = useState(false);
  const [greenVal, setGreenVal] = useState(benchmark.threshold_green?.toString() || '');
  const [amberVal, setAmberVal] = useState(benchmark.threshold_amber?.toString() || '');

  const Icon = config.icon;
  const hasValues = benchmark.threshold_green != null && benchmark.threshold_amber != null;

  const handleSave = () => {
    const g = parseFloat(greenVal);
    const a = parseFloat(amberVal);
    if (!isNaN(g) && !isNaN(a)) {
      onEdit(benchmark.metric, g, a);
      setEditing(false);
    }
  };

  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-ats-accent/10 flex items-center justify-center">
            <Icon size={16} className="text-ats-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ats-text">{config.label}</div>
            {benchmark.auto_computed && (
              <div className="text-[10px] text-ats-text-muted">Auto-computed</div>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-ats-text-muted hover:text-ats-text transition-colors"
        >
          {editing ? <X size={14} /> : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <input
              type="number"
              step="0.01"
              value={greenVal}
              onChange={(e) => setGreenVal(e.target.value)}
              placeholder="Green threshold"
              className="flex-1 bg-ats-bg border border-ats-border rounded-lg px-2 py-1 text-xs text-ats-text"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <input
              type="number"
              step="0.01"
              value={amberVal}
              onChange={(e) => setAmberVal(e.target.value)}
              placeholder="Amber threshold"
              className="flex-1 bg-ats-bg border border-ats-border rounded-lg px-2 py-1 text-xs text-ats-text"
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-ats-accent hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Save size={12} /> Save
          </button>
        </div>
      ) : hasValues ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-ats-text-muted">Scale</span>
            </div>
            <span className="text-sm font-semibold text-emerald-400">
              {config.lowerBetter ? '<= ' : '>= '}{config.format(benchmark.threshold_green!)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs text-ats-text-muted">Watch</span>
            </div>
            <span className="text-sm font-semibold text-amber-400">
              {config.lowerBetter ? '<= ' : '>= '}{config.format(benchmark.threshold_amber!)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-ats-text-muted">Cut</span>
            </div>
            <span className="text-sm font-semibold text-red-400">
              {config.lowerBetter ? '> ' : '< '}{config.format(benchmark.threshold_amber!)}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-ats-text-muted text-center py-2">
          No data yet. Benchmarks will auto-compute from profitable days.
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function BenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [stoplights, setStoplights] = useState<Stoplight[]>([]);
  const [summary, setSummary] = useState<StoplightSummary>({ scale: 0, watch: 0, cut: 0 });
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [filterSignal, setFilterSignal] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const [benchRes, stoplightRes, summaryRes] = await Promise.all([
        apiFetch<{ benchmarks: Benchmark[] }>('/benchmarks'),
        apiFetch<{ stoplights: Stoplight[] }>('/benchmarks/stoplights'),
        apiFetch<{ summary: StoplightSummary }>('/benchmarks/stoplights/summary'),
      ]);
      setBenchmarks(benchRes.benchmarks);
      setStoplights(stoplightRes.stoplights);
      setSummary(summaryRes.summary);
    } catch (err) {
      console.error('Failed to load benchmarks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      await apiFetch('/benchmarks/compute', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error('Failed to compute benchmarks:', err);
    } finally {
      setComputing(false);
    }
  };

  const handleEditBenchmark = async (metric: string, green: number, amber: number) => {
    try {
      await apiFetch(`/benchmarks/${metric}`, {
        method: 'PUT',
        body: JSON.stringify({ threshold_green: green, threshold_amber: amber }),
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to update benchmark:', err);
    }
  };

  // Apply client-side filters
  const filteredStoplights = stoplights.filter((s) => {
    if (filterSignal && s.signal !== filterSignal) return false;
    if (filterPlatform && s.platform !== filterPlatform) return false;
    return true;
  });

  const total = summary.scale + summary.watch + summary.cut;

  if (loading) {
    return (
      <PageShell title="Benchmarks & Stoplights">
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ats-accent" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Profit Benchmarks & Stoplights"
      subtitle="Auto-derived KPI thresholds and campaign signals"
      actions={
        <button
          onClick={handleCompute}
          disabled={computing}
          className="flex items-center gap-1.5 px-3 py-2 bg-ats-accent hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={computing ? 'animate-spin' : ''} />
          {computing ? 'Computing...' : 'Recompute'}
        </button>
      }
    >
      {/* Summary Bar */}
      {total > 0 && (
        <div className="bg-ats-card border border-ats-border rounded-xl p-4 mb-4 flex items-center gap-6 flex-wrap">
          <div className="text-sm text-ats-text-muted font-medium">
            {total} Campaign{total !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setFilterSignal(filterSignal === 'scale' ? '' : 'scale')}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-opacity ${filterSignal && filterSignal !== 'scale' ? 'opacity-40' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">{summary.scale} Scaling</span>
            </button>
            <button
              onClick={() => setFilterSignal(filterSignal === 'watch' ? '' : 'watch')}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-opacity ${filterSignal && filterSignal !== 'watch' ? 'opacity-40' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-amber-400">{summary.watch} Watching</span>
            </button>
            <button
              onClick={() => setFilterSignal(filterSignal === 'cut' ? '' : 'cut')}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-opacity ${filterSignal && filterSignal !== 'cut' ? 'opacity-40' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="text-red-400">{summary.cut} Cut</span>
            </button>
          </div>
        </div>
      )}

      {/* Benchmark Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {['roas', 'cpa', 'ncpa', 'mer', 'aov', 'profit_margin'].map((metric) => {
          const bench = benchmarks.find((b) => b.metric === metric) || {
            metric,
            threshold_green: null,
            threshold_amber: null,
            auto_computed: true,
            last_computed: null,
          };
          return (
            <BenchmarkCard
              key={metric}
              benchmark={bench}
              onEdit={handleEditBenchmark}
            />
          );
        })}
      </div>

      {/* Campaign Stoplights Table */}
      <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-ats-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-ats-text flex items-center gap-2">
            <Target size={16} className="text-ats-accent" />
            Campaign Stoplights
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="bg-ats-bg border border-ats-border rounded-lg px-2 py-1 text-xs text-ats-text"
            >
              <option value="">All Platforms</option>
              <option value="meta">Meta</option>
              <option value="tiktok">TikTok</option>
              <option value="newsbreak">NewsBreak</option>
            </select>
          </div>
        </div>

        {filteredStoplights.length === 0 ? (
          <div className="p-8 text-center text-sm text-ats-text-muted">
            {stoplights.length === 0
              ? 'No campaign stoplights computed yet. Click "Recompute" to generate them.'
              : 'No campaigns match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ats-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-10">Signal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider">Campaign</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-24">Platform</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-28">Spend</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-28">Revenue</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-20">ROAS</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-ats-text-muted uppercase tracking-wider w-24">CPA</th>
                </tr>
              </thead>
              <tbody>
                {filteredStoplights.map((s) => {
                  const style = SIGNAL_STYLES[s.signal] || SIGNAL_STYLES.watch;
                  return (
                    <tr
                      key={`${s.platform}-${s.campaign_id}`}
                      className={`border-b border-ats-border/50 transition-colors ${style.rowBg}`}
                    >
                      <td className="px-4 py-3">
                        <SignalBadge signal={s.signal} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-ats-text truncate max-w-[300px]">
                          {s.campaign_name || s.campaign_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-ats-text-muted">
                          {PLATFORM_LABELS[s.platform] || s.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-ats-text font-mono">
                          ${(s.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-ats-text font-mono">
                          ${(s.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold font-mono ${style.text}`}>
                          {s.roas != null ? `${s.roas.toFixed(2)}x` : '--'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-ats-text font-mono">
                          {s.cpa != null ? `$${s.cpa.toFixed(2)}` : '--'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
