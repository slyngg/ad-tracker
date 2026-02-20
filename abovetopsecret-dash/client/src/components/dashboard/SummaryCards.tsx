import { fmt } from '../../lib/formatters';
import { SummaryData } from '../../lib/api';
import AnimatedNumber from '../shared/AnimatedNumber';

function SummaryCard({ label, value, format, color }: {
  label: string;
  value: number;
  format: (n: number) => string;
  color?: string;
}) {
  return (
    <div className="bg-ats-card rounded-xl px-4 py-3.5 min-w-[140px] flex-1 border border-ats-border">
      <div className="text-[11px] text-ats-text-muted uppercase tracking-widest mb-1 font-mono">
        {label}
      </div>
      <div
        className="text-[22px] font-bold font-mono"
        style={{ color: color || '#f9fafb' }}
      >
        <AnimatedNumber value={value} format={format} />
      </div>
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: SummaryData | null }) {
  if (!summary) return null;

  const roiColor = summary.total_roi >= 2 ? '#10b981' : summary.total_roi >= 1 ? '#f59e0b' : '#ef4444';

  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto">
      <SummaryCard label="Spend" value={summary.total_spend} format={fmt.currency} />
      <SummaryCard label="Revenue" value={summary.total_revenue} format={fmt.currency} color="#10b981" />
      <SummaryCard label="ROI" value={summary.total_roi} format={fmt.ratio} color={roiColor} />
      <SummaryCard label="Orders" value={summary.total_conversions} format={fmt.num} />
    </div>
  );
}
