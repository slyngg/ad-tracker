import { useState, useEffect, useCallback } from 'react';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import PieBreakdown from '../../components/charts/PieBreakdown';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

interface CampaignCategory {
  name: string;
  keywords: string[];
  campaigns: MetricRow[];
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  avgRoas: number;
}

const CATEGORY_RULES: { name: string; keywords: string[] }[] = [
  { name: 'Brand', keywords: ['brand', 'branded', 'branding'] },
  { name: 'Prospecting', keywords: ['prospecting', 'prospect', 'cold', 'awareness', 'reach', 'top_of_funnel', 'tof', 'tofu'] },
  { name: 'Retargeting', keywords: ['retarget', 'retargeting', 'remarket', 'remarketing', 'warm', 'bot', 'bofu', 'mof', 'mofu'] },
  { name: 'Lookalike', keywords: ['lookalike', 'lal', 'similar'] },
  { name: 'Conversion', keywords: ['conversion', 'purchase', 'sale', 'order', 'lead', 'cbo'] },
  { name: 'Video', keywords: ['video', 'vv', 'view'] },
  { name: 'Dynamic', keywords: ['dynamic', 'dpa', 'catalog', 'daba'] },
];

function categorize(metrics: MetricRow[]): CampaignCategory[] {
  const categories: Map<string, MetricRow[]> = new Map();
  const uncategorized: MetricRow[] = [];

  for (const row of metrics) {
    const name = (row.offer_name || '').toLowerCase();
    let matched = false;

    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((kw) => name.includes(kw))) {
        const existing = categories.get(rule.name) || [];
        existing.push(row);
        categories.set(rule.name, existing);
        matched = true;
        break;
      }
    }

    if (!matched) {
      uncategorized.push(row);
    }
  }

  if (uncategorized.length > 0) {
    categories.set('Other', uncategorized);
  }

  const result: CampaignCategory[] = [];
  for (const [name, campaigns] of categories) {
    const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
    const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
    const ruleMatch = CATEGORY_RULES.find((r) => r.name === name);

    result.push({
      name,
      keywords: ruleMatch?.keywords || [],
      campaigns,
      totalSpend,
      totalRevenue,
      totalConversions,
      avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    });
  }

  return result.sort((a, b) => b.totalSpend - a.totalSpend);
}

export default function AIVisibilityPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [categories, setCategories] = useState<CampaignCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
      setCategories(categorize(data));
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

  const spendPie = categories.map((c) => ({ name: c.name, value: c.totalSpend }));
  const totalSpend = categories.reduce((s, c) => s + c.totalSpend, 0);
  const totalRevenue = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <PageShell title="AI Visibility" showDatePicker subtitle="Campaign Analysis by Detected Category">
        <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="AI Visibility" showDatePicker subtitle="Auto-grouped campaign analysis by naming pattern detection">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Categories</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{categories.length}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Campaigns</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{metrics.length}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Spend</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(totalSpend)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Overall ROAS</div>
          <div className={`text-2xl font-bold font-mono ${overallRoas >= 2 ? 'text-ats-green' : overallRoas >= 1 ? 'text-ats-yellow' : 'text-ats-red'}`}>
            {fmt.ratio(overallRoas)}
          </div>
        </div>
      </div>

      {/* Spend by Category Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-ats-card border border-ats-border rounded-lg p-4">
          <PieBreakdown data={spendPie} title="Spend by Category" />
        </div>

        {/* Category Performance Bars */}
        <div className="bg-ats-card border border-ats-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-ats-text mb-4">Category Performance Comparison</h3>
          <div className="space-y-3">
            {categories.map((cat) => {
              const pct = totalSpend > 0 ? (cat.totalSpend / totalSpend) * 100 : 0;
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ats-text font-semibold">{cat.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-ats-text-muted">{fmt.currency(cat.totalSpend)}</span>
                      <span
                        className={`font-mono font-semibold ${
                          cat.avgRoas >= 2 ? 'text-ats-green' : cat.avgRoas >= 1 ? 'text-ats-yellow' : 'text-ats-red'
                        }`}
                      >
                        {fmt.ratio(cat.avgRoas)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-ats-bg rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        cat.avgRoas >= 2 ? 'bg-ats-green' : cat.avgRoas >= 1 ? 'bg-ats-yellow' : 'bg-ats-red'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detection info */}
      <div className="bg-ats-bg/50 border border-ats-border rounded-lg px-4 py-3 mb-6">
        <p className="text-xs text-ats-text-muted">
          Categories are auto-detected by scanning campaign and offer names for keywords like: brand, prospecting, retargeting, lookalike, conversion, video, dynamic.
          Campaigns that don't match any pattern are grouped under "Other".
        </p>
      </div>

      {/* Category Details */}
      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.name} className="bg-ats-card border border-ats-border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedCat(expandedCat === cat.name ? null : cat.name)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-ats-hover transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-ats-text">{cat.name}</span>
                <span className="text-xs text-ats-text-muted bg-ats-bg px-2 py-0.5 rounded-full">
                  {cat.campaigns.length} campaign{cat.campaigns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-ats-text-muted">Spend: <span className="text-ats-text font-mono">{fmt.currency(cat.totalSpend)}</span></span>
                <span className="text-ats-text-muted">Rev: <span className="text-ats-green font-mono">{fmt.currency(cat.totalRevenue)}</span></span>
                <span className={`font-mono font-semibold ${cat.avgRoas >= 2 ? 'text-ats-green' : cat.avgRoas >= 1 ? 'text-ats-yellow' : 'text-ats-red'}`}>
                  {fmt.ratio(cat.avgRoas)}
                </span>
                <span className="text-ats-text-muted">{expandedCat === cat.name ? '-' : '+'}</span>
              </div>
            </button>

            {expandedCat === cat.name && (
              <div className="border-t border-ats-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ats-border text-ats-text-muted">
                      <th className="text-left px-4 py-2 font-medium">Campaign / Offer</th>
                      <th className="text-left px-4 py-2 font-medium">Spend</th>
                      <th className="text-left px-4 py-2 font-medium">Revenue</th>
                      <th className="text-left px-4 py-2 font-medium">Conv.</th>
                      <th className="text-left px-4 py-2 font-medium">ROAS</th>
                      <th className="text-left px-4 py-2 font-medium">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.campaigns.map((c, i) => {
                      const roas = c.spend > 0 ? c.revenue / c.spend : 0;
                      return (
                        <tr key={i} className="border-b border-ats-border/50 hover:bg-ats-hover">
                          <td className="px-4 py-2 text-ats-text truncate max-w-[250px]">{c.offer_name}</td>
                          <td className="px-4 py-2 text-ats-text font-mono">{fmt.currency(c.spend)}</td>
                          <td className="px-4 py-2 text-ats-green font-mono">{fmt.currency(c.revenue)}</td>
                          <td className="px-4 py-2 text-ats-text font-mono">{fmt.num(c.conversions)}</td>
                          <td className="px-4 py-2 font-mono">
                            <span className={roas >= 2 ? 'text-ats-green' : roas >= 1 ? 'text-ats-yellow' : 'text-ats-red'}>
                              {fmt.ratio(roas)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-ats-text font-mono">{fmt.currency(c.cpa)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
