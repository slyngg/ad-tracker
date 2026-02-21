import { MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';

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
    <div className="overflow-x-auto rounded-xl border border-ats-border">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                className={`px-3.5 py-3 text-left bg-ats-card text-ats-text-muted font-semibold text-[11px] uppercase tracking-wide cursor-pointer whitespace-nowrap border-b border-ats-border font-mono select-none ${
                  col.sticky ? 'sticky left-0 z-[2] shadow-[2px_0_4px_rgba(0,0,0,0.3)]' : 'z-[1]'
                }`}
              >
                {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={`${row.offer_name}-${row.account_name}-${i}`} className={i % 2 === 0 ? 'bg-ats-bg' : 'bg-ats-row-alt'}>
              {COLUMNS.map((col) => {
                const val = (row as unknown as Record<string, unknown>)[col.key];
                const numVal = typeof val === 'number' ? val : null;
                const overrideInfo = row._overrides?.[col.key];

                return (
                  <td
                    key={col.key}
                    className={`px-3.5 py-3 whitespace-nowrap border-b border-ats-card min-h-[44px] ${
                      col.key === 'offer_name' ? 'font-semibold' : ''
                    } ${typeof val === 'number' ? 'font-mono' : ''} ${
                      col.sticky
                        ? `sticky left-0 z-[1] shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${i % 2 === 0 ? 'bg-ats-bg' : 'bg-ats-row-alt'}`
                        : ''
                    }`}
                    style={{ color: col.color && numVal != null ? col.color(numVal) : '#d1d5db' }}
                    title={overrideInfo ? `Original: ${col.format(overrideInfo.original)} → Override: ${col.format(overrideInfo.override)} by ${overrideInfo.set_by}` : undefined}
                  >
                    {overrideInfo && (
                      <span className="text-ats-yellow mr-1 text-[10px]">*</span>
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
