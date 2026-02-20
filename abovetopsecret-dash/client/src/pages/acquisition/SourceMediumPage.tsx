import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import PieBreakdown from '../../components/charts/PieBreakdown';

interface SourceMediumGroup {
  source: string;
  medium: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  clicks: number;
  impressions: number;
}

function parseSourceMedium(row: MetricRow): { source: string; medium: string } {
  // Try to parse source/medium from account_name or offer_name
  // Common patterns: "facebook / cpc", "google / organic", or just use account as source
  const name = row.account_name || '';
  const parts = name.split(/\s*[\/|_-]\s*/);
  if (parts.length >= 2) {
    return { source: parts[0].trim() || 'direct', medium: parts[1].trim() || '(none)' };
  }
  // Fallback: use account_name as source, derive medium from spend
  return {
    source: name || 'direct',
    medium: row.spend > 0 ? 'paid' : 'organic',
  };
}

export default function SourceMediumPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<keyof SourceMediumGroup>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load metrics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SourceMediumGroup>();
    for (const row of metrics) {
      const { source, medium } = parseSourceMedium(row);
      const key = `${source}|||${medium}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend += row.spend;
        existing.revenue += row.revenue;
        existing.conversions += row.conversions;
        // clicks and impressions computed from rates
        const estClicks = row.ctr > 0 && row.cpm > 0 ? (row.spend / row.cpm) * 1000 * (row.ctr / 100) : 0;
        const estImpressions = row.cpm > 0 ? (row.spend / row.cpm) * 1000 : 0;
        existing.clicks += estClicks;
        existing.impressions += estImpressions;
      } else {
        const estClicks = row.ctr > 0 && row.cpm > 0 ? (row.spend / row.cpm) * 1000 * (row.ctr / 100) : 0;
        const estImpressions = row.cpm > 0 ? (row.spend / row.cpm) * 1000 : 0;
        map.set(key, {
          source,
          medium,
          spend: row.spend,
          revenue: row.revenue,
          roas: 0,
          conversions: row.conversions,
          clicks: estClicks,
          impressions: estImpressions,
        });
      }
    }
    // Compute ROAS for each group
    for (const group of map.values()) {
      group.roas = group.spend > 0 ? group.revenue / group.spend : 0;
    }
    return Array.from(map.values());
  }, [metrics]);

  const sorted = useMemo(() => {
    return [...grouped].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [grouped, sortCol, sortDir]);

  const handleSort = useCallback((col: keyof SourceMediumGroup) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }, [sortCol]);

  const pieData = useMemo(
    () => grouped
      .filter((g) => g.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((g) => ({ name: `${g.source} / ${g.medium}`, value: Math.round(g.revenue) })),
    [grouped],
  );

  const barData = useMemo(
    () => grouped
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((g) => ({
        name: `${g.source} / ${g.medium}`,
        spend: Math.round(g.spend),
        revenue: Math.round(g.revenue),
      })),
    [grouped],
  );

  // Totals row
  const totals = useMemo(() => {
    return grouped.reduce(
      (acc, g) => ({
        spend: acc.spend + g.spend,
        revenue: acc.revenue + g.revenue,
        conversions: acc.conversions + g.conversions,
      }),
      { spend: 0, revenue: 0, conversions: 0 },
    );
  }, [grouped]);

  const sortArrow = (col: keyof SourceMediumGroup) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const thCls = "px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted cursor-pointer hover:text-ats-text transition-colors select-none";
  const tdCls = "px-3 py-2.5 text-sm font-mono";

  return (
    <PageShell
      title="Source / Medium"
      subtitle="Traffic sources grouped by UTM source and medium"
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

      {!loading && !error && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Spend</div>
              <div className="text-xl font-bold text-ats-text font-mono">{fmt.currency(totals.spend)}</div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Revenue</div>
              <div className="text-xl font-bold text-ats-green font-mono">{fmt.currency(totals.revenue)}</div>
            </div>
            <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Sources</div>
              <div className="text-xl font-bold text-ats-text font-mono">{grouped.length}</div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Pie chart */}
            <div className="bg-ats-card rounded-xl border border-ats-border p-4">
              <PieBreakdown data={pieData} title="Revenue by Source" />
            </div>

            {/* Bar chart */}
            <div className="bg-ats-card rounded-xl border border-ats-border p-4">
              <h3 className="text-sm font-semibold text-ats-text mb-2">Spend vs Revenue by Source</h3>
              {barData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#374151' }}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                      width={56}
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
                        value != null ? `$${value.toLocaleString()}` : '$0',
                        name ? name.charAt(0).toUpperCase() + name.slice(1) : '',
                      ]}
                    />
                    <Bar dataKey="spend" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="revenue" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ats-border bg-ats-bg/50">
                    <th className={thCls} onClick={() => handleSort('source')}>Source{sortArrow('source')}</th>
                    <th className={thCls} onClick={() => handleSort('medium')}>Medium{sortArrow('medium')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('spend')}>Spend{sortArrow('spend')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('revenue')}>Revenue{sortArrow('revenue')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('roas')}>ROAS{sortArrow('roas')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('conversions')}>Conv{sortArrow('conversions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-ats-text-muted text-sm">
                        No source/medium data available
                      </td>
                    </tr>
                  ) : (
                    sorted.map((row, i) => {
                      const roasColor = row.roas >= 2 ? 'text-ats-green' : row.roas >= 1 ? 'text-ats-yellow' : 'text-ats-red';
                      return (
                        <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50 transition-colors">
                          <td className={`${tdCls} text-ats-text font-semibold`}>{row.source}</td>
                          <td className={`${tdCls} text-ats-text-muted`}>{row.medium}</td>
                          <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.spend)}</td>
                          <td className={`${tdCls} text-right text-ats-green`}>{fmt.currency(row.revenue)}</td>
                          <td className={`${tdCls} text-right ${roasColor}`}>{fmt.ratio(row.roas)}</td>
                          <td className={`${tdCls} text-right text-ats-text`}>{fmt.num(row.conversions)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {sorted.length > 0 && (
                  <tfoot>
                    <tr className="bg-ats-bg/50 border-t border-ats-border">
                      <td className={`${tdCls} font-semibold text-ats-text`} colSpan={2}>Total</td>
                      <td className={`${tdCls} text-right font-semibold text-ats-text`}>{fmt.currency(totals.spend)}</td>
                      <td className={`${tdCls} text-right font-semibold text-ats-green`}>{fmt.currency(totals.revenue)}</td>
                      <td className={`${tdCls} text-right font-semibold`}>
                        {fmt.ratio(totals.spend > 0 ? totals.revenue / totals.spend : 0)}
                      </td>
                      <td className={`${tdCls} text-right font-semibold text-ats-text`}>{fmt.num(totals.conversions)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
