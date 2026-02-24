import { MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';

interface MobileCardProps {
  row: MetricRow;
  expanded: boolean;
  onToggle: () => void;
}

export default function MobileCard({ row, expanded, onToggle }: MobileCardProps) {
  const roiColor = row.roi >= 2 ? 'text-ats-green' : row.roi >= 1 ? 'text-ats-yellow' : 'text-ats-red';

  return (
    <div
      onClick={onToggle}
      className="bg-ats-card rounded-xl p-4 mb-2 border border-ats-border cursor-pointer transition-all hover:border-ats-text-muted/30"
    >
      <div className="flex justify-between items-center">
        <div>
          <div className="text-[15px] font-bold text-ats-text">{row.offer_name}</div>
          <div className="text-xs text-ats-text-muted">{row.account_name}</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold font-mono ${roiColor}`}>
            {fmt.ratio(row.roi)}
          </div>
          <div className="text-[11px] text-ats-text-muted">ROI</div>
        </div>
      </div>

      <div className="flex gap-4 mt-3">
        <div>
          <div className="text-[11px] text-ats-text-muted">Spend</div>
          <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(row.spend)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ats-text-muted">Revenue</div>
          <div className="text-sm font-semibold text-ats-green font-mono">{fmt.currency(row.revenue)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ats-text-muted">Conv.</div>
          <div className="text-sm font-semibold text-ats-text font-mono">{row.conversions}</div>
        </div>
        <div>
          <div className="text-[11px] text-ats-text-muted">CPA</div>
          <div className="text-sm font-semibold text-ats-text font-mono">{fmt.currency(row.cpa)}</div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ats-border grid grid-cols-3 gap-y-2.5 gap-x-4">
          {([
            ['AOV', fmt.currency(row.aov)],
            ['CTR', fmt.pct(row.ctr)],
            ['CPM', fmt.currency(row.cpm)],
            ['CPC', fmt.currency(row.cpc)],
            ['CVR', fmt.pct(row.cvr)],
            ['New %', fmt.pct(row.new_customer_pct)],
            ['LP CTR', fmt.pct(row.lp_ctr)],
            ['1-Pack', fmt.pctRaw(row.take_rate_1)],
            ['3-Pack', fmt.pctRaw(row.take_rate_3)],
            ['5-Pack', fmt.pctRaw(row.take_rate_5)],
            ['Sub %', fmt.pctRaw(row.subscription_pct)],
            ['Upsell', fmt.pctRaw(row.upsell_take_rate)],
            ['Decline', fmt.pctRaw(row.upsell_decline_rate)],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label}>
              <div className="text-[10px] text-ats-text-muted uppercase">{label}</div>
              <div className="text-[13px] font-semibold text-ats-text-secondary font-mono">{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center mt-2">
        <span className="text-[10px] text-ats-text-muted">
          {expanded ? '▲ tap to collapse' : '▼ tap to expand'}
        </span>
      </div>
    </div>
  );
}
