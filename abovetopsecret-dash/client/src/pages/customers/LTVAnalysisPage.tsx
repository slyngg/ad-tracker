import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';

interface OfferLTV {
  offer: string;
  account: string;
  aov: number;
  cpa: number;
  subscriptionPct: number;
  estimatedFrequency: number;
  oneTimeLTV: number;
  subscriptionLTV: number;
  blendedLTV: number;
  ltvCacRatio: number;
  takeRate1: number;
  takeRate3: number;
  takeRate5: number;
  subTakeRate1: number;
  subTakeRate3: number;
  subTakeRate5: number;
}

const tooltipStyle = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#f9fafb',
  fontSize: 12,
};

// Estimate purchase frequency from take rates (higher take rates = repeat buyers)
function estimateFrequency(row: MetricRow): number {
  const avgTakeRate = (row.take_rate_1 + row.take_rate_3 + row.take_rate_5) / 3;
  // Base of 1 purchase + additional based on take rate and upsell acceptance
  return 1 + avgTakeRate * 2 + (row.upsell_take_rate || 0) * 0.5;
}

// Estimate subscription LTV from sub take rates over time
function estimateSubLTV(row: MetricRow): number {
  // Average monthly retention from subscription take rates
  // sub_take_rate_1/3/5 represent subscription conversion at different touchpoints
  const avgSubRate = (row.sub_take_rate_1 + row.sub_take_rate_3 + row.sub_take_rate_5) / 3;
  // Estimated months retained: 1 / (1 - retention_proxy)
  const retentionProxy = Math.min(avgSubRate, 0.95); // cap at 95%
  const estimatedMonths = retentionProxy > 0 ? 1 / (1 - retentionProxy) : 1;
  return row.aov * estimatedMonths;
}

export default function LTVAnalysisPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMetrics()
      .then((data) => {
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load metrics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const offerLTVs = useMemo<OfferLTV[]>(() => {
    return metrics.map((row) => {
      const freq = estimateFrequency(row);
      const oneTimeLTV = row.aov * freq;
      const subLTV = estimateSubLTV(row);
      const subPct = row.subscription_pct || 0;
      const blended = oneTimeLTV * (1 - subPct) + subLTV * subPct;
      const cac = row.cpa > 0 ? row.cpa : 1;

      return {
        offer: row.offer_name,
        account: row.account_name,
        aov: row.aov,
        cpa: row.cpa,
        subscriptionPct: subPct,
        estimatedFrequency: freq,
        oneTimeLTV: oneTimeLTV,
        subscriptionLTV: subLTV,
        blendedLTV: blended,
        ltvCacRatio: blended / cac,
        takeRate1: row.take_rate_1,
        takeRate3: row.take_rate_3,
        takeRate5: row.take_rate_5,
        subTakeRate1: row.sub_take_rate_1,
        subTakeRate3: row.sub_take_rate_3,
        subTakeRate5: row.sub_take_rate_5,
      };
    });
  }, [metrics]);

  // Summary stats
  const summary = useMemo(() => {
    if (!offerLTVs.length) return { avgLTV: 0, avgCAC: 0, avgRatio: 0, totalOffers: 0 };
    const totalLTV = offerLTVs.reduce((s, o) => s + o.blendedLTV, 0);
    const totalCAC = offerLTVs.reduce((s, o) => s + o.cpa, 0);
    const totalRatio = offerLTVs.reduce((s, o) => s + o.ltvCacRatio, 0);
    return {
      avgLTV: totalLTV / offerLTVs.length,
      avgCAC: totalCAC / offerLTVs.length,
      avgRatio: totalRatio / offerLTVs.length,
      totalOffers: offerLTVs.length,
    };
  }, [offerLTVs]);

  // Chart: LTV by offer (top 10 by blended LTV)
  const ltvByOfferChart = useMemo(() => {
    return [...offerLTVs]
      .sort((a, b) => b.blendedLTV - a.blendedLTV)
      .slice(0, 10)
      .map((o) => ({
        name: o.offer.length > 20 ? o.offer.slice(0, 18) + '...' : o.offer,
        fullName: o.offer,
        'One-time LTV': Number(o.oneTimeLTV.toFixed(2)),
        'Subscription LTV': Number(o.subscriptionLTV.toFixed(2)),
      }));
  }, [offerLTVs]);

  // Chart: LTV vs CAC comparison
  const ltvVsCacChart = useMemo(() => {
    return [...offerLTVs]
      .sort((a, b) => b.blendedLTV - a.blendedLTV)
      .slice(0, 10)
      .map((o) => ({
        name: o.offer.length > 20 ? o.offer.slice(0, 18) + '...' : o.offer,
        fullName: o.offer,
        LTV: Number(o.blendedLTV.toFixed(2)),
        CAC: Number(o.cpa.toFixed(2)),
      }));
  }, [offerLTVs]);

  if (loading) {
    return (
      <PageShell title="LTV Analysis" subtitle="Lifetime value estimation by offer">
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="LTV Analysis" subtitle="Lifetime value estimation by offer">
        <div className="text-center py-10 text-ats-red text-sm">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="LTV Analysis" subtitle="Lifetime value estimation by offer">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg Blended LTV</div>
          <div className="text-2xl font-bold text-ats-green font-mono">{fmt.currency(summary.avgLTV)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg CAC</div>
          <div className="text-2xl font-bold text-ats-red font-mono">{fmt.currency(summary.avgCAC)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">LTV:CAC Ratio</div>
          <div className={`text-2xl font-bold font-mono ${
            summary.avgRatio >= 3 ? 'text-ats-green' : summary.avgRatio >= 1.5 ? 'text-ats-yellow' : 'text-ats-red'
          }`}>
            {fmt.ratio(summary.avgRatio)}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Offers Analyzed</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{summary.totalOffers}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* LTV by Offer */}
        <div className="bg-ats-card rounded-xl border border-ats-border p-4">
          <h3 className="text-sm font-semibold text-ats-text mb-4">LTV by Offer (Top 10)</h3>
          {ltvByOfferChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ltvByOfferChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                    name ?? '',
                  ]}
                  labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                />
                <Legend
                  verticalAlign="top"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-ats-text-muted">{value}</span>
                  )}
                />
                <Bar dataKey="One-time LTV" stackId="ltv" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Subscription LTV" stackId="ltv" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">No data available</div>
          )}
        </div>

        {/* LTV vs CAC */}
        <div className="bg-ats-card rounded-xl border border-ats-border p-4">
          <h3 className="text-sm font-semibold text-ats-text mb-4">LTV vs CAC (Top 10)</h3>
          {ltvVsCacChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ltvVsCacChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                    name ?? '',
                  ]}
                  labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                />
                <Legend
                  verticalAlign="top"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-ats-text-muted">{value}</span>
                  )}
                />
                <Bar dataKey="LTV" fill="#22c55e" radius={[0, 4, 4, 0]} />
                <Bar dataKey="CAC" fill="#ef4444" radius={[0, 4, 4, 0]} />
                <ReferenceLine x={0} stroke="#374151" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">No data available</div>
          )}
        </div>
      </div>

      {/* Detailed LTV Table */}
      <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
        <div className="px-4 py-3 border-b border-ats-border">
          <h3 className="text-sm font-semibold text-ats-text">Detailed LTV Breakdown</h3>
          <p className="text-xs text-ats-text-muted mt-0.5">
            LTV estimated from AOV, take rates, and subscription metrics
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Offer</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">AOV</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Est. Freq</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">1x LTV</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Sub LTV</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Blended LTV</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">CAC</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">LTV:CAC</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Sub %</th>
              </tr>
            </thead>
            <tbody>
              {offerLTVs
                .sort((a, b) => b.blendedLTV - a.blendedLTV)
                .map((row, i) => (
                  <tr
                    key={`${row.offer}-${row.account}-${i}`}
                    className={`border-b border-ats-border/50 hover:bg-ats-hover transition-colors ${
                      i % 2 === 0 ? 'bg-ats-card' : 'bg-ats-row-alt'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-ats-text font-medium truncate max-w-[200px]">
                      <div>{row.offer}</div>
                      <div className="text-[10px] text-ats-text-muted">{row.account}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-text">{fmt.currency(row.aov)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-text">{row.estimatedFrequency.toFixed(1)}x</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-accent">{fmt.currency(row.oneTimeLTV)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-accent">{fmt.currency(row.subscriptionLTV)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-green font-semibold">{fmt.currency(row.blendedLTV)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-red">{fmt.currency(row.cpa)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        row.ltvCacRatio >= 3
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : row.ltvCacRatio >= 1.5
                            ? 'bg-yellow-900/50 text-yellow-300'
                            : 'bg-red-900/50 text-red-300'
                      }`}>
                        {fmt.ratio(row.ltvCacRatio)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ats-text-muted">{fmt.pct(row.subscriptionPct)}</td>
                  </tr>
                ))}
              {offerLTVs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-ats-text-muted">
                    No metric data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology Note */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mt-4">
        <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-2">Methodology</h4>
        <ul className="text-xs text-ats-text-muted space-y-1">
          <li>One-time LTV = AOV x Estimated Purchase Frequency (derived from take rates and upsell acceptance)</li>
          <li>Subscription LTV = AOV x Estimated Months Retained (derived from subscription take rates)</li>
          <li>Blended LTV = (One-time LTV x (1 - Sub%)) + (Subscription LTV x Sub%)</li>
          <li>LTV:CAC Ratio: 3.0x+ (healthy), 1.5x-3.0x (acceptable), below 1.5x (needs attention)</li>
        </ul>
      </div>

      <div className="text-center pt-4 pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {metrics.length} offers analyzed · LTV estimates derived from metric data
        </div>
      </div>
    </PageShell>
  );
}
