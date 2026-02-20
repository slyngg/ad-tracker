import { fmt } from '../../lib/formatters';
import { SummaryData } from '../../lib/api';

function SummaryCard({ label, value, color }: {
  label: string;
  value: string | number;
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
        {value}
      </div>
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: SummaryData | null }) {
  if (!summary) return null;

  const roiColor = summary.total_roi >= 2 ? '#10b981' : summary.total_roi >= 1 ? '#f59e0b' : '#ef4444';

  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto">
      <SummaryCard label="Spend" value={fmt.currency(summary.total_spend)} />
      <SummaryCard label="Revenue" value={fmt.currency(summary.total_revenue)} color="#10b981" />
      <SummaryCard label="ROI" value={fmt.ratio(summary.total_roi)} color={roiColor} />
      <SummaryCard label="Orders" value={fmt.num(summary.total_conversions)} />
    </div>
  );
}
