import { fmt$, fmtNum, fmtRoas, fmtPct } from '../formatters';
import type { LiveCampaign, ColumnDef } from '../types';

interface TotalsRowProps {
  campaigns: LiveCampaign[];
  columns: ColumnDef[];
  hasCheckbox: boolean;
}

export default function TotalsRow({ campaigns, columns, hasCheckbox }: TotalsRowProps) {
  if (campaigns.length === 0) return null;

  const totals = campaigns.reduce(
    (a, c) => ({
      spend: a.spend + c.spend,
      clicks: a.clicks + c.clicks,
      impressions: a.impressions + c.impressions,
      conversions: a.conversions + c.conversions,
      conversion_value: a.conversion_value + c.conversion_value,
      daily_budget: a.daily_budget + (c.daily_budget || 0),
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0, daily_budget: 0 }
  );

  const computed: Record<string, number> = {
    spend: totals.spend,
    clicks: totals.clicks,
    impressions: totals.impressions,
    conversions: totals.conversions,
    conversion_value: totals.conversion_value,
    roas: totals.spend > 0 ? totals.conversion_value / totals.spend : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    net_profit: totals.conversion_value - totals.spend,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
    daily_budget: totals.daily_budget,
  };

  function formatValue(key: string, val: number): string {
    switch (key) {
      case 'spend':
      case 'conversion_value':
      case 'cpa':
      case 'cpc':
      case 'cpm':
      case 'daily_budget':
        return fmt$(val);
      case 'net_profit':
        return fmt$(val);
      case 'roas':
        return fmtRoas(val);
      case 'ctr':
        return fmtPct(val);
      case 'clicks':
      case 'impressions':
      case 'conversions':
        return fmtNum(val);
      default:
        return String(val);
    }
  }

  return (
    <tfoot className="sticky bottom-0 bg-ats-card border-t-2 border-ats-border">
      <tr>
        {/* Checkbox column */}
        {hasCheckbox && <td className="px-4 py-3" />}
        {/* Campaign name + Status + Platform = 3 fixed cols */}
        <td className="px-4 py-3 text-left text-xs font-bold text-ats-text uppercase tracking-wide">
          Totals ({campaigns.length})
        </td>
        <td />
        <td />
        {/* Data columns */}
        {columns.map(col => {
          const val = computed[col.key] ?? 0;
          const isNegative = col.key === 'net_profit' && val < 0;
          return (
            <td key={col.key} className={`px-4 py-3 text-right text-xs font-bold font-mono ${
              col.key === 'net_profit'
                ? (isNegative ? 'text-red-400' : 'text-emerald-400')
                : col.key === 'conversion_value'
                  ? 'text-emerald-400'
                  : 'text-ats-text'
            }`}>
              {formatValue(col.key, val)}
            </td>
          );
        })}
        {/* Actions column */}
        <td className="px-4 py-3" />
      </tr>
    </tfoot>
  );
}
