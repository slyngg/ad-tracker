import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchFunnel, fetchMetrics, FunnelData, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import ConversionFunnel from '../../components/charts/ConversionFunnel';
import AnimatedNumber from '../../components/shared/AnimatedNumber';

const FUNNEL_COLORS = ['#3b82f6', '#8b5cf6', '#eab308', '#22c55e', '#ef4444', '#f97316'];

interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

export default function WebsiteFunnelPage() {
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState('All');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [funnel, metricsData] = await Promise.all([
        fetchFunnel(),
        fetchMetrics(),
      ]);
      setFunnelData(funnel);
      setMetrics(metricsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const offers = useMemo(() => {
    const set = new Set(metrics.map((m) => m.offer_name));
    return ['All', ...Array.from(set).sort()];
  }, [metrics]);

  // Build funnel steps from funnel data
  const funnelSteps = useMemo((): FunnelStep[] => {
    if (!funnelData) return [];
    return [
      { label: 'Impressions', value: funnelData.impressions, color: FUNNEL_COLORS[0] },
      { label: 'Clicks', value: funnelData.clicks, color: FUNNEL_COLORS[1] },
      { label: 'LP Views', value: funnelData.lp_views, color: FUNNEL_COLORS[2] },
      { label: 'Orders', value: funnelData.orders, color: FUNNEL_COLORS[3] },
      { label: 'Upsells Offered', value: funnelData.upsells_offered, color: FUNNEL_COLORS[4] },
      { label: 'Upsells Accepted', value: funnelData.upsells_accepted, color: FUNNEL_COLORS[5] },
    ];
  }, [funnelData]);

  // Conversion rates between steps
  const conversionRates = useMemo(() => {
    if (!funnelData) return [];
    const steps = [
      funnelData.impressions,
      funnelData.clicks,
      funnelData.lp_views,
      funnelData.orders,
      funnelData.upsells_offered,
      funnelData.upsells_accepted,
    ];
    const labels = [
      'Impressions -> Clicks',
      'Clicks -> LP Views',
      'LP Views -> Orders',
      'Orders -> Upsells Offered',
      'Upsells Offered -> Accepted',
    ];
    return labels.map((label, i) => ({
      label,
      from: steps[i],
      to: steps[i + 1],
      rate: steps[i] > 0 ? (steps[i + 1] / steps[i]) * 100 : 0,
    }));
  }, [funnelData]);

  // Per-offer funnel approximation from metrics
  const offerFunnel = useMemo(() => {
    if (selectedOffer === 'All' || !metrics.length) return null;
    const offerRows = metrics.filter((m) => m.offer_name === selectedOffer);
    if (!offerRows.length) return null;

    // Aggregate across all accounts for this offer
    let totalSpend = 0;
    let totalConversions = 0;
    let totalImpressions = 0;
    let totalClicks = 0;

    for (const row of offerRows) {
      totalSpend += row.spend;
      totalConversions += row.conversions;
      // Estimate from rates
      totalImpressions += row.cpm > 0 ? (row.spend / row.cpm) * 1000 : 0;
      totalClicks += row.cpc > 0 ? row.spend / row.cpc : 0;
    }

    const avgLpCtr = offerRows.reduce((s, r) => s + r.lp_ctr, 0) / offerRows.length;
    const lpViews = totalClicks * (avgLpCtr / 100);
    const avgUpsellRate = offerRows.reduce((s, r) => s + r.upsell_take_rate, 0) / offerRows.length;
    const upsellsOffered = totalConversions;
    const upsellsAccepted = totalConversions * (avgUpsellRate / 100);

    return [
      { label: 'Impressions', value: Math.round(totalImpressions), color: FUNNEL_COLORS[0] },
      { label: 'Clicks', value: Math.round(totalClicks), color: FUNNEL_COLORS[1] },
      { label: 'LP Views', value: Math.round(lpViews), color: FUNNEL_COLORS[2] },
      { label: 'Orders', value: Math.round(totalConversions), color: FUNNEL_COLORS[3] },
      { label: 'Upsells Offered', value: Math.round(upsellsOffered), color: FUNNEL_COLORS[4] },
      { label: 'Upsells Accepted', value: Math.round(upsellsAccepted), color: FUNNEL_COLORS[5] },
    ] as FunnelStep[];
  }, [metrics, selectedOffer]);

  const activeFunnel = selectedOffer === 'All' ? funnelSteps : (offerFunnel || funnelSteps);

  // Overall metrics
  const overallRate = funnelData && funnelData.impressions > 0
    ? (funnelData.orders / funnelData.impressions) * 100
    : 0;
  const upsellRate = funnelData && funnelData.upsells_offered > 0
    ? (funnelData.upsells_accepted / funnelData.upsells_offered) * 100
    : 0;

  return (
    <PageShell
      title="Conversion Funnel"
      subtitle="Visualize the journey from impressions to upsells"
      actions={
        <select
          value={selectedOffer}
          onChange={(e) => setSelectedOffer(e.target.value)}
          className="px-3 py-2 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent"
        >
          {offers.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      }
    >
      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-5 text-ats-red text-sm">{error}</div>
      )}

      {!loading && !error && funnelData && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Impressions</div>
              <div className="text-2xl font-bold text-ats-text font-mono">
                <AnimatedNumber value={funnelData.impressions} format={fmt.num} />
              </div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Orders</div>
              <div className="text-2xl font-bold text-ats-green font-mono">
                <AnimatedNumber value={funnelData.orders} format={fmt.num} />
              </div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Overall CVR</div>
              <div className={`text-2xl font-bold font-mono ${overallRate >= 1 ? 'text-ats-green' : 'text-ats-yellow'}`}>
                <AnimatedNumber value={overallRate} format={(n) => `${n.toFixed(2)}%`} />
              </div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Upsell Rate</div>
              <div className={`text-2xl font-bold font-mono ${upsellRate >= 30 ? 'text-ats-green' : upsellRate >= 15 ? 'text-ats-yellow' : 'text-ats-red'}`}>
                <AnimatedNumber value={upsellRate} format={(n) => `${n.toFixed(1)}%`} />
              </div>
            </div>
          </div>

          {/* Main Funnel Visualization */}
          <div className="bg-ats-card rounded-xl border border-ats-border p-6 mb-6">
            <h3 className="text-sm font-semibold text-ats-text mb-4">
              {selectedOffer === 'All' ? 'Overall Funnel' : `Funnel: ${selectedOffer}`}
            </h3>
            <ConversionFunnel data={activeFunnel} />
          </div>

          {/* Step-by-step conversion rates */}
          <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6">
            <h3 className="text-sm font-semibold text-ats-text mb-4">Step-by-Step Conversion Rates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {conversionRates.map((step, i) => {
                const rateColor = step.rate >= 30 ? 'text-ats-green' : step.rate >= 10 ? 'text-ats-yellow' : 'text-ats-red';
                return (
                  <div key={i} className="bg-ats-bg rounded-lg p-3 border border-ats-border">
                    <div className="text-[10px] text-ats-text-muted uppercase tracking-wide mb-2 leading-tight">
                      {step.label}
                    </div>
                    <div className={`text-xl font-bold font-mono ${rateColor}`}>
                      {step.rate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-ats-text-muted mt-1 font-mono">
                      {fmt.num(step.from)} -&gt; {fmt.num(step.to)}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1 bg-ats-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(step.rate, 100)}%`,
                          backgroundColor: step.rate >= 30 ? '#22c55e' : step.rate >= 10 ? '#eab308' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Funnel Analysis Table */}
          <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
            <div className="px-4 py-3 border-b border-ats-border">
              <h3 className="text-sm font-semibold text-ats-text">Funnel Detail</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ats-border bg-ats-bg/50">
                    <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Stage</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Volume</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">% of Top</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Step CVR</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Drop-off</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFunnel.map((step, i) => {
                    const topVal = activeFunnel[0]?.value || 1;
                    const pctOfTop = (step.value / topVal) * 100;
                    const prevVal = i > 0 ? activeFunnel[i - 1].value : step.value;
                    const stepCvr = prevVal > 0 ? (step.value / prevVal) * 100 : 100;
                    const dropOff = i > 0 && prevVal > 0 ? prevVal - step.value : 0;

                    return (
                      <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: step.color || FUNNEL_COLORS[i] }}
                            />
                            <span className="text-sm font-semibold text-ats-text">{step.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-mono text-ats-text">
                          {fmt.num(step.value)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-mono text-ats-text-muted">
                          {pctOfTop.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2.5 text-right text-sm font-mono ${
                          i === 0 ? 'text-ats-text-muted' : stepCvr >= 30 ? 'text-ats-green' : stepCvr >= 10 ? 'text-ats-yellow' : 'text-ats-red'
                        }`}>
                          {i === 0 ? '-' : `${stepCvr.toFixed(1)}%`}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-mono text-ats-red">
                          {i === 0 ? '-' : `-${fmt.num(dropOff)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
