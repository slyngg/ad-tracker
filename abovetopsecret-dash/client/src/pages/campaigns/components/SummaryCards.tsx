import { fmt$, fmtNum } from '../formatters';

interface SummaryCardsProps {
  campaignCount: number;
  spend: number;
  conversions: number;
  revenue: number;
  netProfit: number;
  isToday: boolean;
}

function Stat({ label, value, cls = 'text-ats-text' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

export default function SummaryCards({ campaignCount, spend, conversions, revenue, netProfit, isToday }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <Stat label="Campaigns" value={String(campaignCount)} />
      <Stat label={isToday ? "Today's Spend" : 'Total Spend'} value={fmt$(spend)} />
      <Stat label="Conversions" value={fmtNum(conversions)} />
      <Stat label="Revenue" value={fmt$(revenue)} cls="text-emerald-400" />
      <Stat
        label="Net Profit"
        value={fmt$(netProfit)}
        cls={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
      />
    </div>
  );
}
