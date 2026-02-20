import { MetricRow } from '../lib/api';
import { fmt } from '../lib/formatters';

interface MobileCardProps {
  row: MetricRow;
  expanded: boolean;
  onToggle: () => void;
}

export default function MobileCard({ row, expanded, onToggle }: MobileCardProps) {
  const roiColor = row.roi >= 2 ? '#10b981' : row.roi >= 1 ? '#f59e0b' : '#ef4444';

  return (
    <div
      onClick={onToggle}
      style={{
        background: '#111827',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
        border: '1px solid #1f2937',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb' }}>{row.offer_name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{row.account_name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: roiColor,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {fmt.ratio(row.roi)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>ROI</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Spend</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt.currency(row.spend)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Revenue</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt.currency(row.revenue)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Conv.</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', fontFamily: "'JetBrains Mono', monospace" }}>
            {row.conversions}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>CPA</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt.currency(row.cpa)}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid #1f2937',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px 16px',
        }}>
          {([
            ['AOV', fmt.currency(row.aov)],
            ['CTR', fmt.pct(row.ctr)],
            ['CPM', fmt.currency(row.cpm)],
            ['CPC', fmt.currency(row.cpc)],
            ['CVR', fmt.pct(row.cvr)],
            ['New %', fmt.pct(row.new_customer_pct)],
            ['1-Pack', fmt.pctRaw(row.take_rate_1)],
            ['3-Pack', fmt.pctRaw(row.take_rate_3)],
            ['5-Pack', fmt.pctRaw(row.take_rate_5)],
            ['Sub %', fmt.pctRaw(row.subscription_pct)],
            ['Upsell', fmt.pctRaw(row.upsell_take_rate)],
            ['Decline', fmt.pctRaw(row.upsell_decline_rate)],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db', fontFamily: "'JetBrains Mono', monospace" }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: '#4b5563' }}>
          {expanded ? '▲ tap to collapse' : '▼ tap to expand'}
        </span>
      </div>
    </div>
  );
}
