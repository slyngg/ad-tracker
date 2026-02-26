import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine,
} from 'recharts';
import { RefreshCw, Save, Zap, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PageShell from '../components/shared/PageShell';
import { getAuthToken } from '../stores/authStore';
import { useChartTheme } from '../hooks/useChartTheme';

// ─── API helpers ─────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChannelParam {
  channel: string;
  alpha: number;
  beta: number;
  gamma: number;
  rSquared: number | null;
  dataPoints: number;
  lastFitted: string | null;
}

interface ChannelEfficiency {
  channel: string;
  currentSpend: number;
  predictedRevenue: number;
  marginalRoas: number;
  headroom: 'high' | 'medium' | 'low';
}

interface CurvePoint {
  spend: number;
  predicted_revenue: number;
}

interface BudgetAllocation {
  channel: string;
  spend: number;
  predicted_revenue: number;
}

interface Scenario {
  id: number;
  name: string;
  total_budget: number;
  allocations: BudgetAllocation[];
  predicted_total_revenue: number;
  predicted_roas: number;
  is_optimal: boolean;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CHANNEL_COLORS: Record<string, string> = {
  meta: '#3b82f6',
  tiktok: '#06b6d4',
  newsbreak: '#f59e0b',
  google: '#10b981',
};

const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  newsbreak: 'NewsBreak',
  google: 'Google',
};

const HEADROOM_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'High', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  low: { label: 'Low', color: 'text-red-400', bg: 'bg-red-500/20' },
};

function fmt(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDec(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BudgetForecastPage() {
  const ct = useChartTheme();
  const cardCls = 'bg-ats-card rounded-xl border border-ats-border';

  // State
  const [channels, setChannels] = useState<ChannelParam[]>([]);
  const [efficiency, setEfficiency] = useState<ChannelEfficiency[]>([]);
  const [curves, setCurves] = useState<Record<string, CurvePoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [fitting, setFitting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  // Optimizer state
  const [totalBudget, setTotalBudget] = useState<string>('5000');
  const [optimalAllocations, setOptimalAllocations] = useState<BudgetAllocation[]>([]);
  const [optimalRevenue, setOptimalRevenue] = useState(0);
  const [optimalRoas, setOptimalRoas] = useState(0);

  // What-if simulator state
  const [simAllocations, setSimAllocations] = useState<Record<string, number>>({});
  const [simResults, setSimResults] = useState<BudgetAllocation[]>([]);
  const [simTotalRevenue, setSimTotalRevenue] = useState(0);
  const [simRoas, setSimRoas] = useState(0);
  const [scenarioName, setScenarioName] = useState('');
  const [savingScenario, setSavingScenario] = useState(false);

  // ─── Load data ─────────────────────────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    try {
      const data = await apiFetch<{ channels: ChannelParam[]; efficiency: ChannelEfficiency[] }>('/mmm/channels');
      setChannels(data.channels);
      setEfficiency(data.efficiency);

      // Initialize sim allocations from current spend
      const allocs: Record<string, number> = {};
      for (const eff of data.efficiency) {
        allocs[eff.channel] = Math.round(eff.currentSpend);
      }
      setSimAllocations(allocs);

      // Load response curves for each channel
      const curveData: Record<string, CurvePoint[]> = {};
      for (const ch of data.channels) {
        // Use max of current spend * 3 or gamma * 2 for the curve range
        const currentEff = data.efficiency.find(e => e.channel === ch.channel);
        const maxSpend = Math.max((currentEff?.currentSpend || 1000) * 3, ch.gamma * 2, 5000);
        const curveResult = await apiFetch<{ curve: CurvePoint[] }>(
          `/mmm/response-curve/${ch.channel}?min=0&max=${maxSpend}&steps=80`
        );
        curveData[ch.channel] = curveResult.curve;
      }
      setCurves(curveData);
    } catch (err) {
      console.error('Failed to load MMM data:', err);
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    try {
      const data = await apiFetch<Scenario[]>('/mmm/scenarios');
      setScenarios(data);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([loadChannels(), loadScenarios()]).finally(() => setLoading(false));
  }, [loadChannels, loadScenarios]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleFit = async () => {
    setFitting(true);
    try {
      await apiFetch('/mmm/fit', { method: 'POST' });
      await loadChannels();
    } catch (err) {
      console.error('Fit failed:', err);
    } finally {
      setFitting(false);
    }
  };

  const handleOptimize = async () => {
    const budget = parseFloat(totalBudget);
    if (!budget || budget <= 0) return;
    setOptimizing(true);
    try {
      const data = await apiFetch<{
        allocations: BudgetAllocation[];
        totalRevenue: number;
        roas: number;
      }>(`/mmm/optimize?budget=${budget}`, { method: 'POST' });
      setOptimalAllocations(data.allocations);
      setOptimalRevenue(data.totalRevenue);
      setOptimalRoas(data.roas);
    } catch (err) {
      console.error('Optimize failed:', err);
    } finally {
      setOptimizing(false);
    }
  };

  const handleSimulate = useCallback(async (allocs: Record<string, number>) => {
    const allocArr = Object.entries(allocs).map(([channel, spend]) => ({ channel, spend }));
    if (allocArr.length === 0) return;
    try {
      const data = await apiFetch<{
        allocations: BudgetAllocation[];
        totalRevenue: number;
        roas: number;
      }>('/mmm/simulate', {
        method: 'POST',
        body: JSON.stringify({ allocations: allocArr }),
      });
      setSimResults(data.allocations);
      setSimTotalRevenue(data.totalRevenue);
      setSimRoas(data.roas);
    } catch {}
  }, []);

  // Run simulation whenever slider values change
  useEffect(() => {
    if (Object.keys(simAllocations).length > 0) {
      const t = setTimeout(() => handleSimulate(simAllocations), 300);
      return () => clearTimeout(t);
    }
  }, [simAllocations, handleSimulate]);

  const handleSaveScenario = async () => {
    if (!scenarioName.trim()) return;
    setSavingScenario(true);
    try {
      const totalSpend = Object.values(simAllocations).reduce((s, v) => s + v, 0);
      await apiFetch('/mmm/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          name: scenarioName.trim(),
          total_budget: totalSpend,
          allocations: simResults,
          predicted_total_revenue: simTotalRevenue,
          predicted_roas: simRoas,
          is_optimal: false,
        }),
      });
      setScenarioName('');
      await loadScenarios();
    } catch (err) {
      console.error('Save scenario failed:', err);
    } finally {
      setSavingScenario(false);
    }
  };

  const updateSlider = (channel: string, value: number) => {
    setSimAllocations(prev => ({ ...prev, [channel]: value }));
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageShell title="Budget Forecast" subtitle="Media Mix Model">
        <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
          Loading...
        </div>
      </PageShell>
    );
  }

  const hasData = channels.length > 0;

  return (
    <PageShell
      title="Budget Forecast"
      subtitle="MMM+ Media Mix Model"
      actions={
        <button
          onClick={handleFit}
          disabled={fitting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-accent/20 text-ats-accent rounded-lg text-xs font-medium hover:bg-ats-accent/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fitting ? 'animate-spin' : ''}`} />
          {fitting ? 'Fitting...' : 'Re-fit Curves'}
        </button>
      }
    >
      {!hasData ? (
        <div className={`${cardCls} p-8 text-center`}>
          <Zap className="w-10 h-10 text-ats-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-ats-text mb-1">No model data yet</h3>
          <p className="text-xs text-ats-text-muted mb-4">
            Click "Re-fit Curves" to train the media mix model on your historical spend and revenue data.
            At least 5 days of data per channel is required.
          </p>
          <button
            onClick={handleFit}
            disabled={fitting}
            className="px-4 py-2 bg-ats-accent rounded-lg text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {fitting ? 'Fitting...' : 'Fit Model'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ─── Current Efficiency Panel ──────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-ats-text mb-3">Channel Efficiency</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {efficiency.map(eff => {
                const hr = HEADROOM_STYLES[eff.headroom];
                return (
                  <div key={eff.channel} className={`${cardCls} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[eff.channel] || '#6b7280' }}
                        />
                        <span className="text-sm font-semibold text-ats-text">
                          {CHANNEL_LABELS[eff.channel] || eff.channel}
                        </span>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${hr.bg} ${hr.color}`}>
                        {hr.label} headroom
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Daily Spend</div>
                        <div className="text-lg font-bold text-ats-text font-mono">{fmt(eff.currentSpend)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Predicted Rev</div>
                        <div className="text-lg font-bold text-emerald-400 font-mono">{fmt(eff.predictedRevenue)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Marginal ROAS</div>
                        <div className="text-lg font-bold text-ats-accent font-mono">{eff.marginalRoas.toFixed(2)}x</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">R-Squared</div>
                        <div className="text-lg font-bold text-ats-text font-mono">
                          {channels.find(c => c.channel === eff.channel)?.rSquared?.toFixed(3) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Response Curves ───────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-ats-text mb-3">Channel Response Curves</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {channels.map(ch => {
                const curve = curves[ch.channel] || [];
                const eff = efficiency.find(e => e.channel === ch.channel);
                const color = CHANNEL_COLORS[ch.channel] || '#6b7280';

                return (
                  <div key={ch.channel} className={`${cardCls} p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-ats-text">
                        {CHANNEL_LABELS[ch.channel] || ch.channel}
                      </h3>
                      <span className="text-[10px] text-ats-text-muted font-mono">
                        {ch.dataPoints} data points
                      </span>
                    </div>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={curve} margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                          <XAxis
                            dataKey="spend"
                            tick={{ fill: ct.axisText, fontSize: 10 }}
                            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                          />
                          <YAxis
                            tick={{ fill: ct.axisText, fontSize: 10 }}
                            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: ct.tooltipBg,
                              border: `1px solid ${ct.tooltipBorder}`,
                              borderRadius: 8,
                              color: ct.tooltipText,
                              fontSize: 12,
                            }}
                            formatter={(value: number) => [fmtDec(value), 'Predicted Revenue']}
                            labelFormatter={(label: number) => `Spend: ${fmtDec(label)}`}
                          />
                          <Line
                            type="monotone"
                            dataKey="predicted_revenue"
                            stroke={color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, stroke: ct.activeDotStroke, strokeWidth: 2 }}
                          />
                          {eff && (
                            <ReferenceLine
                              x={eff.currentSpend}
                              stroke="#f59e0b"
                              strokeDasharray="6 4"
                              label={{
                                value: 'Current',
                                position: 'top',
                                fill: '#f59e0b',
                                fontSize: 10,
                              }}
                            />
                          )}
                          {/* Mark the half-saturation (gamma) point */}
                          <ReferenceLine
                            x={ch.gamma}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            strokeOpacity={0.5}
                            label={{
                              value: 'Diminishing',
                              position: 'insideTopRight',
                              fill: '#ef4444',
                              fontSize: 9,
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Budget Optimizer ──────────────────────────────────────── */}
          <div className={`${cardCls} p-5`}>
            <h2 className="text-sm font-semibold text-ats-text mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-ats-accent" />
              Budget Optimizer
            </h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-5">
              <div>
                <label className="text-[10px] text-ats-text-muted uppercase tracking-wide block mb-1">
                  Total Daily Budget
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ats-text-muted">$</span>
                  <input
                    type="number"
                    value={totalBudget}
                    onChange={e => setTotalBudget(e.target.value)}
                    className="bg-ats-bg border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text font-mono w-32 focus:outline-none focus:ring-1 focus:ring-ats-accent"
                  />
                </div>
              </div>
              <button
                onClick={handleOptimize}
                disabled={optimizing || !totalBudget}
                className="px-4 py-1.5 bg-ats-accent rounded-lg text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {optimizing ? 'Optimizing...' : 'Optimize'}
              </button>
            </div>

            {optimalAllocations.length > 0 && (
              <div className="space-y-4">
                {/* Comparison bars */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Current allocation */}
                  <div>
                    <h4 className="text-xs font-medium text-ats-text-muted uppercase tracking-wide mb-2">
                      Current Allocation
                    </h4>
                    <div className="space-y-2">
                      {efficiency.map(eff => {
                        const total = efficiency.reduce((s, e) => s + e.currentSpend, 0);
                        const pct = total > 0 ? (eff.currentSpend / total) * 100 : 0;
                        return (
                          <div key={eff.channel} className="flex items-center gap-2">
                            <span className="text-xs text-ats-text w-16 shrink-0">
                              {CHANNEL_LABELS[eff.channel] || eff.channel}
                            </span>
                            <div className="flex-1 h-5 bg-ats-bg rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: CHANNEL_COLORS[eff.channel] || '#6b7280',
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono text-ats-text w-16 text-right">
                              {fmt(eff.currentSpend)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-ats-text-muted">
                      Total predicted: <span className="font-mono text-ats-text">{fmt(efficiency.reduce((s, e) => s + e.predictedRevenue, 0))}</span>
                    </div>
                  </div>

                  {/* Optimal allocation */}
                  <div>
                    <h4 className="text-xs font-medium text-emerald-400 uppercase tracking-wide mb-2">
                      Optimal Allocation
                    </h4>
                    <div className="space-y-2">
                      {optimalAllocations.map(alloc => {
                        const total = optimalAllocations.reduce((s, a) => s + a.spend, 0);
                        const pct = total > 0 ? (alloc.spend / total) * 100 : 0;
                        return (
                          <div key={alloc.channel} className="flex items-center gap-2">
                            <span className="text-xs text-ats-text w-16 shrink-0">
                              {CHANNEL_LABELS[alloc.channel] || alloc.channel}
                            </span>
                            <div className="flex-1 h-5 bg-ats-bg rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: CHANNEL_COLORS[alloc.channel] || '#6b7280',
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono text-ats-text w-16 text-right">
                              {fmt(alloc.spend)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-ats-text-muted">
                      Total predicted: <span className="font-mono text-emerald-400">{fmt(optimalRevenue)}</span>
                      {' '} | ROAS: <span className="font-mono text-ats-accent">{optimalRoas.toFixed(2)}x</span>
                    </div>
                  </div>
                </div>

                {/* Revenue comparison */}
                {(() => {
                  const currentRev = efficiency.reduce((s, e) => s + e.predictedRevenue, 0);
                  const delta = optimalRevenue - currentRev;
                  const pctChange = currentRev > 0 ? (delta / currentRev) * 100 : 0;
                  return delta !== 0 ? (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${delta > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      {delta > 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                      )}
                      <span className={`text-sm font-medium ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {delta > 0 ? '+' : ''}{fmt(delta)} ({pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%) predicted revenue vs current
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* ─── What-If Simulator ─────────────────────────────────────── */}
          <div className={`${cardCls} p-5`}>
            <h2 className="text-sm font-semibold text-ats-text mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              What-If Simulator
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {channels.map(ch => {
                  const value = simAllocations[ch.channel] || 0;
                  const eff = efficiency.find(e => e.channel === ch.channel);
                  const maxVal = Math.max((eff?.currentSpend || 1000) * 5, ch.gamma * 3, 10000);
                  const color = CHANNEL_COLORS[ch.channel] || '#6b7280';

                  return (
                    <div key={ch.channel}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-medium text-ats-text">
                            {CHANNEL_LABELS[ch.channel] || ch.channel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-ats-text">{fmt(value)}</span>
                          <input
                            type="number"
                            value={value}
                            onChange={e => updateSlider(ch.channel, Math.max(0, Number(e.target.value) || 0))}
                            className="bg-ats-bg border border-ats-border rounded px-2 py-0.5 text-xs text-ats-text font-mono w-20 focus:outline-none focus:ring-1 focus:ring-ats-accent"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={maxVal}
                        step={Math.max(10, Math.round(maxVal / 200))}
                        value={value}
                        onChange={e => updateSlider(ch.channel, Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${color} ${(value / maxVal) * 100}%, #374151 ${(value / maxVal) * 100}%)`,
                        }}
                      />
                    </div>
                  );
                })}

                {/* Save scenario */}
                <div className="flex items-center gap-2 pt-2 border-t border-ats-border/50">
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={e => setScenarioName(e.target.value)}
                    placeholder="Scenario name..."
                    className="flex-1 bg-ats-bg border border-ats-border rounded-lg px-3 py-1.5 text-xs text-ats-text focus:outline-none focus:ring-1 focus:ring-ats-accent"
                  />
                  <button
                    onClick={handleSaveScenario}
                    disabled={savingScenario || !scenarioName.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-ats-accent/20 text-ats-accent rounded-lg text-xs font-medium hover:bg-ats-accent/30 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    Save
                  </button>
                </div>
              </div>

              {/* Simulation results */}
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`${cardCls} p-3`}>
                    <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Total Spend</div>
                    <div className="text-lg font-bold text-ats-text font-mono">
                      {fmt(Object.values(simAllocations).reduce((s, v) => s + v, 0))}
                    </div>
                  </div>
                  <div className={`${cardCls} p-3`}>
                    <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Predicted Revenue</div>
                    <div className="text-lg font-bold text-emerald-400 font-mono">{fmt(simTotalRevenue)}</div>
                  </div>
                  <div className={`${cardCls} p-3`}>
                    <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">ROAS</div>
                    <div className="text-lg font-bold text-ats-accent font-mono">{simRoas.toFixed(2)}x</div>
                  </div>
                  <div className={`${cardCls} p-3`}>
                    <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-0.5">Channels</div>
                    <div className="text-lg font-bold text-ats-text font-mono">{channels.length}</div>
                  </div>
                </div>

                {/* Per-channel breakdown */}
                <div className="space-y-2">
                  {simResults.map(r => (
                    <div key={r.channel} className="flex items-center justify-between py-1.5 border-b border-ats-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[r.channel] || '#6b7280' }}
                        />
                        <span className="text-xs text-ats-text">
                          {CHANNEL_LABELS[r.channel] || r.channel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-ats-text-muted">{fmt(r.spend)}</span>
                        <span className="text-xs font-mono text-emerald-400">{fmt(r.predicted_revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Saved Scenarios ───────────────────────────────────────── */}
          {scenarios.length > 0 && (
            <div className={`${cardCls} p-5`}>
              <h2 className="text-sm font-semibold text-ats-text mb-3">Saved Scenarios</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ats-text-muted uppercase tracking-wide border-b border-ats-border/50">
                      <th className="text-left py-2 pr-3">Name</th>
                      <th className="text-right py-2 px-3">Budget</th>
                      <th className="text-right py-2 px-3">Predicted Rev</th>
                      <th className="text-right py-2 px-3">ROAS</th>
                      <th className="text-right py-2 pl-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map(s => (
                      <tr key={s.id} className="border-b border-ats-border/30 last:border-0">
                        <td className="py-2 pr-3 text-ats-text font-medium">
                          {s.name}
                          {s.is_optimal && (
                            <span className="ml-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                              Optimal
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-ats-text">{fmt(parseFloat(String(s.total_budget)))}</td>
                        <td className="text-right py-2 px-3 font-mono text-emerald-400">{fmt(parseFloat(String(s.predicted_total_revenue)))}</td>
                        <td className="text-right py-2 px-3 font-mono text-ats-accent">{parseFloat(String(s.predicted_roas)).toFixed(2)}x</td>
                        <td className="text-right py-2 pl-3 text-ats-text-muted">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
