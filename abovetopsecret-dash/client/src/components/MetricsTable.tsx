import { MetricRow } from '../lib/api';
import { fmt } from '../lib/formatters';

interface Column {
  key: string;
  label: string;
  format: (v: number | string) => string;
  color?: (v: number) => string;
  sticky?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'offer_name', label: 'Offer', format: (v) => String(v), sticky: true },
  { key: 'account_name', label: 'Account', format: (v) => String(v) },
  { key: 'spend', label: 'Spend', format: (v) => fmt.currency(v as number) },
  { key: 'revenue', label: 'Revenue', format: (v) => fmt.currency(v as number) },
  { key: 'roi', label: 'ROI', format: (v) => fmt.ratio(v as number), color: (v) => v >= 2 ? '#10b981' : v >= 1 ? '#f59e0b' : '#ef4444' },
  { key: 'cpa', label: 'CPA', format: (v) => fmt.currency(v as number) },
  { key: 'aov', label: 'AOV', format: (v) => fmt.currency(v as number) },
  { key: 'ctr', label: 'CTR', format: (v) => fmt.pct(v as number) },
  { key: 'cpm', label: 'CPM', format: (v) => fmt.currency(v as number) },
  { key: 'cpc', label: 'CPC', format: (v) => fmt.currency(v as number) },
  { key: 'cvr', label: 'CVR', format: (v) => fmt.pct(v as number) },
  { key: 'conversions', label: 'Conv.', format: (v) => fmt.num(v as number) },
  { key: 'new_customer_pct', label: 'New %', format: (v) => fmt.pct(v as number) },
  { key: 'lp_ctr', label: 'LP CTR', format: (v) => fmt.pct(v as number) },
  { key: 'take_rate_1', label: '1-Pack', format: (v) => fmt.pctRaw(v as number) },
  { key: 'take_rate_3', label: '3-Pack', format: (v) => fmt.pctRaw(v as number) },
  { key: 'take_rate_5', label: '5-Pack', format: (v) => fmt.pctRaw(v as number) },
  { key: 'subscription_pct', label: 'Sub %', format: (v) => fmt.pctRaw(v as number) },
  { key: 'upsell_take_rate', label: 'Upsell', format: (v) => fmt.pctRaw(v as number) },
];

interface MetricsTableProps {
  data: MetricRow[];
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
}

export default function MetricsTable({ data, sortCol, sortDir, onSort }: MetricsTableProps) {
  return (
    <div style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      borderRadius: 12,
      border: '1px solid #1f2937',
    }}>
      <table style={{
        width: 'max-content',
        minWidth: '100%',
        borderCollapse: 'collapse',
        fontSize: 12,
      }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                style={{
                  padding: '12px 14px',
                  textAlign: 'left',
                  minHeight: 44,
                  background: '#111827',
                  color: '#9ca3af',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid #1f2937',
                  position: col.sticky ? 'sticky' : 'static',
                  left: col.sticky ? 0 : 'auto',
                  zIndex: col.sticky ? 2 : 1,
                  boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                  fontFamily: "'JetBrains Mono', monospace",
                  userSelect: 'none',
                }}
              >
                {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={`${row.offer_name}-${row.account_name}-${i}`} style={{ background: i % 2 === 0 ? '#030712' : '#0a0f1a' }}>
              {COLUMNS.map((col) => {
                const val = (row as unknown as Record<string, unknown>)[col.key];
                const numVal = typeof val === 'number' ? val : 0;
                const overrideInfo = row._overrides?.[col.key];

                return (
                  <td
                    key={col.key}
                    style={{
                      padding: '12px 14px',
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid #111827',
                      color: col.color ? col.color(numVal) : '#d1d5db',
                      fontWeight: col.key === 'offer_name' ? 600 : 400,
                      fontFamily: typeof val === 'number' ? "'JetBrains Mono', monospace" : 'inherit',
                      position: col.sticky ? 'sticky' : 'static',
                      left: col.sticky ? 0 : 'auto',
                      background: col.sticky ? (i % 2 === 0 ? '#030712' : '#0a0f1a') : 'transparent',
                      zIndex: col.sticky ? 1 : 0,
                      boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                      minHeight: 44,
                    }}
                    title={overrideInfo ? `Original: ${col.format(overrideInfo.original)} → Override: ${col.format(overrideInfo.override)} by ${overrideInfo.set_by}` : undefined}
                  >
                    {overrideInfo && (
                      <span style={{ color: '#f59e0b', marginRight: 4, fontSize: 10 }}>*</span>
                    )}
                    {col.format(val as number | string)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
