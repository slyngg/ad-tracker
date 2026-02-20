import { fmt } from '../../lib/formatters';
import { SummaryData } from '../../lib/api';
import AnimatedNumber from '../shared/AnimatedNumber';

/**
 * Calculates percentage change between current and previous values.
 * Returns null if previous is null/undefined or zero (avoid division by zero).
 */
function calcDelta(current: number, previous: number | undefined | null): number | null {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * DeltaBadge renders a small "+12% vs yesterday" style indicator.
 * @param delta - percentage change (positive = increase)
 * @param invertColors - if true, a decrease is green (good for spend/CPA)
 */
function DeltaBadge({ delta, invertColors = false }: { delta: number | null; invertColors?: boolean }) {
  if (delta == null) {
    return (
      <span className="text-xs font-medium text-gray-500 ml-1">&mdash;</span>
    );
  }

  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const arrow = isPositive ? '\u2191' : isNegative ? '\u2193' : '';
  const absVal = Math.abs(delta).toFixed(1);

  let colorClass = 'text-gray-500';
  if (isPositive) {
    colorClass = invertColors ? 'text-red-400' : 'text-green-400';
  } else if (isNegative) {
    colorClass = invertColors ? 'text-green-400' : 'text-red-400';
  }

  return (
    <span className={`text-xs font-medium ${colorClass} ml-1.5`} title="vs yesterday">
      {arrow}{absVal}%
    </span>
  );
}

function SummaryCard({ label, value, format, color, delta, invertColors }: {
  label: string;
  value: number;
  format: (n: number) => string;
  color?: string;
  delta?: number | null;
  invertColors?: boolean;
}) {
  return (
    <div className="bg-ats-card rounded-xl px-4 py-3.5 min-w-[140px] flex-1 border border-ats-border">
      <div className="text-[11px] text-ats-text-muted uppercase tracking-widest mb-1 font-mono">
        {label}
      </div>
      <div className="flex items-baseline">
        <div
          className="text-[22px] font-bold font-mono"
          style={{ color: color || '#f9fafb' }}
        >
          <AnimatedNumber value={value} format={format} />
        </div>
        <DeltaBadge delta={delta ?? null} invertColors={invertColors} />
        {delta != null && <span className="text-[9px] text-gray-600 ml-1">vs yday</span>}
      </div>
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: SummaryData | null }) {
  if (!summary) return null;

  const roiColor = summary.total_roi >= 2 ? '#10b981' : summary.total_roi >= 1 ? '#f59e0b' : '#ef4444';
  const prev = summary.previous;

  const spendDelta = calcDelta(summary.total_spend, prev?.total_spend);
  const revenueDelta = calcDelta(summary.total_revenue, prev?.total_revenue);
  const roiDelta = calcDelta(summary.total_roi, prev?.total_roi);
  const ordersDelta = calcDelta(summary.total_conversions, prev?.total_conversions);

  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto">
      <SummaryCard label="Spend" value={summary.total_spend} format={fmt.currency} delta={spendDelta} invertColors />
      <SummaryCard label="Revenue" value={summary.total_revenue} format={fmt.currency} color="#10b981" delta={revenueDelta} />
      <SummaryCard label="ROI" value={summary.total_roi} format={fmt.ratio} color={roiColor} delta={roiDelta} />
      <SummaryCard label="Orders" value={summary.total_conversions} format={fmt.num} delta={ordersDelta} />
    </div>
  );
}
