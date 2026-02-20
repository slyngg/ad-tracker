import { fmt } from '../lib/formatters';
import { SummaryData } from '../lib/api';

function SummaryCard({ label, value, sub, color }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: '#111827',
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 140,
      flex: '1 1 140px',
      border: '1px solid #1f2937',
    }}>
      <div style={{
        fontSize: 11,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: color || '#f9fafb',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: SummaryData | null }) {
  if (!summary) return null;

  const roiColor = summary.total_roi >= 2 ? '#10b981' : summary.total_roi >= 1 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      <SummaryCard label="Spend" value={fmt.currency(summary.total_spend)} />
      <SummaryCard label="Revenue" value={fmt.currency(summary.total_revenue)} color="#10b981" />
      <SummaryCard label="ROI" value={fmt.ratio(summary.total_roi)} color={roiColor} />
      <SummaryCard label="Orders" value={fmt.num(summary.total_conversions)} />
    </div>
  );
}
