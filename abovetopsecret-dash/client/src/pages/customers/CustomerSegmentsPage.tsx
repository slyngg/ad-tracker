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
  Cell,
} from 'recharts';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';

interface SegmentData {
  name: string;
  revenue: number;
  conversions: number;
  avgAOV: number;
  avgCVR: number;
  count: number;
}

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ef4444', '#6b7280'];

const tooltipStyle = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#f9fafb',
  fontSize: 12,
};

export default function CustomerSegmentsPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segmentView, setSegmentView] = useState<'acquisition' | 'subscription'>('acquisition');

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

  // Acquisition segments: New vs Returning
  const acquisitionSegments = useMemo<SegmentData[]>(() => {
    if (!metrics.length) return [];

    let totalNewRevenue = 0;
    let totalRetRevenue = 0;
    let totalNewConv = 0;
    let totalRetConv = 0;
    let sumNewAOV = 0;
    let sumRetAOV = 0;
    let sumNewCVR = 0;
    let sumRetCVR = 0;
    let countNew = 0;
    let countRet = 0;

    metrics.forEach((row) => {
      const newPct = row.new_customer_pct || 0;
      const retPct = 1 - newPct;

      const newRev = row.revenue * newPct;
      const retRev = row.revenue * retPct;
      const newConv = row.conversions * newPct;
      const retConv = row.conversions * retPct;

      totalNewRevenue += newRev;
      totalRetRevenue += retRev;
      totalNewConv += newConv;
      totalRetConv += retConv;

      if (newPct > 0) {
        sumNewAOV += row.aov;
        sumNewCVR += row.cvr;
        countNew++;
      }
      if (retPct > 0) {
        sumRetAOV += row.aov;
        sumRetCVR += row.cvr;
        countRet++;
      }
    });

    return [
      {
        name: 'New Customers',
        revenue: totalNewRevenue,
        conversions: Math.round(totalNewConv),
        avgAOV: countNew > 0 ? sumNewAOV / countNew : 0,
        avgCVR: countNew > 0 ? sumNewCVR / countNew : 0,
        count: countNew,
      },
      {
        name: 'Returning Customers',
        revenue: totalRetRevenue,
        conversions: Math.round(totalRetConv),
        avgAOV: countRet > 0 ? sumRetAOV / countRet : 0,
        avgCVR: countRet > 0 ? sumRetCVR / countRet : 0,
        count: countRet,
      },
    ];
  }, [metrics]);

  // Subscription segments: Subscription vs One-time
  const subscriptionSegments = useMemo<SegmentData[]>(() => {
    if (!metrics.length) return [];

    let totalSubRevenue = 0;
    let totalOnetimeRevenue = 0;
    let totalSubConv = 0;
    let totalOnetimeConv = 0;
    let sumSubAOV = 0;
    let sumOnetimeAOV = 0;
    let sumSubCVR = 0;
    let sumOnetimeCVR = 0;
    let countSub = 0;
    let countOnetime = 0;

    metrics.forEach((row) => {
      const subPct = row.subscription_pct || 0;
      const onetimePct = 1 - subPct;

      totalSubRevenue += row.revenue * subPct;
      totalOnetimeRevenue += row.revenue * onetimePct;
      totalSubConv += row.conversions * subPct;
      totalOnetimeConv += row.conversions * onetimePct;

      if (subPct > 0) {
        sumSubAOV += row.aov;
        sumSubCVR += row.cvr;
        countSub++;
      }
      if (onetimePct > 0) {
        sumOnetimeAOV += row.aov;
        sumOnetimeCVR += row.cvr;
        countOnetime++;
      }
    });

    return [
      {
        name: 'Subscribers',
        revenue: totalSubRevenue,
        conversions: Math.round(totalSubConv),
        avgAOV: countSub > 0 ? sumSubAOV / countSub : 0,
        avgCVR: countSub > 0 ? sumSubCVR / countSub : 0,
        count: countSub,
      },
      {
        name: 'One-time Buyers',
        revenue: totalOnetimeRevenue,
        conversions: Math.round(totalOnetimeConv),
        avgAOV: countOnetime > 0 ? sumOnetimeAOV / countOnetime : 0,
        avgCVR: countOnetime > 0 ? sumOnetimeCVR / countOnetime : 0,
        count: countOnetime,
      },
    ];
  }, [metrics]);

  // Per-offer segment breakdown for the table
  const offerSegments = useMemo(() => {
    return metrics.map((row) => ({
      offer: row.offer_name,
      account: row.account_name,
      newPct: row.new_customer_pct || 0,
      subPct: row.subscription_pct || 0,
      aov: row.aov,
      cvr: row.cvr,
      revenue: row.revenue,
      conversions: row.conversions,
      cpa: row.cpa,
    }));
  }, [metrics]);

  const activeSegments = segmentView === 'acquisition' ? acquisitionSegments : subscriptionSegments;

  // Revenue bar chart data
  const chartData = activeSegments.map((seg) => ({
    name: seg.name,
    revenue: seg.revenue,
    conversions: seg.conversions,
  }));

  if (loading) {
    return (
      <PageShell title="Customer Segments" subtitle="New vs Returning, Subscription vs One-time">
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
      <PageShell title="Customer Segments" subtitle="New vs Returning, Subscription vs One-time">
        <div className="text-center py-10 text-ats-red text-sm">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Customer Segments"
      subtitle="New vs Returning, Subscription vs One-time"
      actions={
        <div className="flex items-center bg-ats-border rounded-lg overflow-hidden">
          <button
            onClick={() => setSegmentView('acquisition')}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              segmentView === 'acquisition'
                ? 'bg-ats-accent text-white'
                : 'text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            Acquisition
          </button>
          <button
            onClick={() => setSegmentView('subscription')}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              segmentView === 'subscription'
                ? 'bg-ats-accent text-white'
                : 'text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            Subscription
          </button>
        </div>
      }
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {activeSegments.map((seg, i) => (
          <div key={seg.name} className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
              <span className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono">{seg.name}</span>
            </div>
            <div className="text-xl font-bold text-ats-text font-mono">{fmt.currency(seg.revenue)}</div>
            <div className="text-xs text-ats-text-muted mt-0.5">{fmt.num(seg.conversions)} conversions</div>
          </div>
        ))}
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg AOV</div>
          <div className="text-xl font-bold text-ats-text font-mono">
            {activeSegments.length > 0
              ? fmt.currency((activeSegments[0].avgAOV + activeSegments[1].avgAOV) / 2)
              : '$0.00'}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Avg CVR</div>
          <div className="text-xl font-bold text-ats-text font-mono">
            {activeSegments.length > 0
              ? fmt.pctRaw((activeSegments[0].avgCVR + activeSegments[1].avgCVR) / 2)
              : '0.0%'}
          </div>
        </div>
      </div>

      {/* Revenue by Segment Chart */}
      <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6">
        <h3 className="text-sm font-semibold text-ats-text mb-4">Revenue by Segment</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#374151' }}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`
                }
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const v = value ?? 0;
                  return [
                    name === 'revenue'
                      ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : v.toLocaleString(),
                    name === 'revenue' ? 'Revenue' : 'Conversions',
                  ];
                }}
                labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-ats-text-muted">
                    {value === 'revenue' ? 'Revenue' : 'Conversions'}
                  </span>
                )}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">
            No data available
          </div>
        )}
      </div>

      {/* Offer Segment Breakdown Table */}
      <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
        <div className="px-4 py-3 border-b border-ats-border">
          <h3 className="text-sm font-semibold text-ats-text">Offer Segment Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Offer</th>
                <th className="text-left px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Account</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">New %</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Sub %</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">AOV</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">CVR</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">Revenue</th>
                <th className="text-right px-4 py-2.5 text-[11px] text-ats-text-muted uppercase tracking-wider font-mono font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {offerSegments.map((row, i) => (
                <tr
                  key={`${row.offer}-${row.account}-${i}`}
                  className={`border-b border-ats-border/50 hover:bg-ats-hover transition-colors ${
                    i % 2 === 0 ? 'bg-ats-card' : 'bg-ats-row-alt'
                  }`}
                >
                  <td className="px-4 py-2.5 text-ats-text font-medium truncate max-w-[200px]">{row.offer}</td>
                  <td className="px-4 py-2.5 text-ats-text-muted truncate max-w-[150px]">{row.account}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={row.newPct >= 0.5 ? 'text-ats-green' : 'text-ats-yellow'}>
                      {fmt.pct(row.newPct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={row.subPct >= 0.3 ? 'text-ats-accent' : 'text-ats-text-muted'}>
                      {fmt.pct(row.subPct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ats-text">{fmt.currency(row.aov)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ats-text">{fmt.pctRaw(row.cvr)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ats-green">{fmt.currency(row.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ats-text">{fmt.currency(row.cpa)}</td>
                </tr>
              ))}
              {offerSegments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ats-text-muted">
                    No metric data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-4 pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {metrics.length} offers loaded · segments derived from new_customer_pct and subscription_pct
        </div>
      </div>
    </PageShell>
  );
}
