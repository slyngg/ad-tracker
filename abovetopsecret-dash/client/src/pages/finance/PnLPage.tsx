import { useState, useEffect, useCallback } from 'react';
import { fetchPnL, PnLData } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';
import AnimatedNumber from '../../components/shared/AnimatedNumber';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

export default function PnLPage() {
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPnL()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <PageShell title="Profit & Loss" showDatePicker subtitle="Today's financial overview">
        <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  if (!data) return null;

  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const cards = [
    { label: 'Revenue', rawValue: data.revenue, format: fmt, color: 'text-ats-green' },
    { label: 'Ad Spend', rawValue: data.adSpend, format: fmt, color: 'text-ats-red' },
    { label: 'COGS / Costs', rawValue: data.cogs, format: fmt, color: 'text-yellow-400' },
    { label: 'Net Profit', rawValue: data.netProfit, format: fmt, color: data.netProfit >= 0 ? 'text-ats-green' : 'text-ats-red' },
    { label: 'Margin', rawValue: data.margin, format: fmtPct, color: data.margin >= 0 ? 'text-ats-green' : 'text-ats-red' },
  ];

  return (
    <PageShell title="Profit & Loss" showDatePicker subtitle="Today's financial overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-ats-card border border-ats-border rounded-xl p-4"
          >
            <div className="text-[11px] text-ats-text-muted uppercase tracking-wide mb-1">
              {card.label}
            </div>
            <div className={`text-xl font-bold ${card.color}`}>
              <AnimatedNumber value={card.rawValue} format={card.format} />
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="bg-ats-card border border-ats-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-ats-text mb-4">P&L Breakdown</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-ats-border/50">
            <span className="text-sm text-ats-text">Revenue</span>
            <span className="text-sm font-semibold text-ats-green">{fmt(data.revenue)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-ats-border/50">
            <span className="text-sm text-ats-text-muted">- Ad Spend</span>
            <span className="text-sm font-semibold text-ats-red">({fmt(data.adSpend)})</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-ats-border/50">
            <span className="text-sm text-ats-text-muted">- COGS / Costs</span>
            <span className="text-sm font-semibold text-yellow-400">({fmt(data.cogs)})</span>
          </div>
          <div className="flex justify-between items-center py-2 border-t-2 border-ats-border mt-2">
            <span className="text-sm font-bold text-ats-text">Net Profit</span>
            <span className={`text-lg font-bold ${data.netProfit >= 0 ? 'text-ats-green' : 'text-ats-red'}`}>
              {fmt(data.netProfit)}
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
