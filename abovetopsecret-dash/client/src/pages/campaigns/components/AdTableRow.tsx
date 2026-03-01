import { Loader2, Copy } from 'lucide-react';
import { fmt$, fmtNum, fmtRoas, fmtPct } from '../formatters';
import type { LiveAd, ColumnDef } from '../types';
import StatusToggle from './StatusToggle';

interface AdTableRowProps {
  ad: LiveAd;
  platform: string;
  adsetId: string;
  columns: ColumnDef[];
  actionLoading: Record<string, boolean>;
  statusOverrides: Record<string, boolean>;
  onStatusChange: (platform: string, entityType: string, entityId: string, enable: boolean) => Promise<void>;
  onDuplicate: (platform: string, entityType: string, entityId: string, parentId?: string) => void;
}

function getAdCellValue(ad: LiveAd, key: string): string {
  switch (key) {
    case 'spend': return fmt$(ad.spend);
    case 'clicks': return fmtNum(ad.clicks);
    case 'impressions': return fmtNum(ad.impressions);
    case 'conversions': return fmtNum(ad.conversions);
    case 'conversion_value': return fmt$(ad.conversion_value);
    case 'roas': return fmtRoas(ad.spend > 0 ? ad.conversion_value / ad.spend : 0);
    case 'cpa': return fmt$(ad.conversions > 0 ? ad.spend / ad.conversions : 0);
    case 'net_profit': return fmt$(ad.conversion_value - ad.spend);
    case 'ctr': return fmtPct(ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0);
    case 'cpc': return fmt$(ad.clicks > 0 ? ad.spend / ad.clicks : 0);
    case 'cpm': return fmt$(ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0);
    case 'daily_budget': return '—';
    default: return '—';
  }
}

export default function AdTableRow({ ad, platform, adsetId, columns, actionLoading, statusOverrides, onStatusChange, onDuplicate }: AdTableRowProps) {
  return (
    <tr className="border-b border-ats-border/20 bg-ats-bg/30">
      <td className="px-4 py-2 pl-16" />
      <td className="px-4 py-2"><span className="text-xs text-ats-text-muted">{ad.ad_name || ad.ad_id || 'Unnamed'}</span></td>
      <td />
      <td />
      {columns.map(col => (
        <td key={col.key} className={`px-4 py-2 text-right text-[11px] ${
          col.key === 'conversion_value' ? 'font-mono text-emerald-400' :
          col.key === 'spend' ? 'font-mono text-ats-text' :
          col.key === 'net_profit' ? `font-mono ${(ad.conversion_value - ad.spend) >= 0 ? 'text-emerald-400' : 'text-red-400'}` :
          'text-ats-text-muted'
        }`}>
          {getAdCellValue(ad, col.key)}
        </td>
      ))}
      <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {ad.ad_id && (
            <>
              <StatusToggle
                enabled={statusOverrides[`ad:${ad.ad_id}`] ?? true}
                onToggle={async (enable) => {
                  await onStatusChange(platform, 'ad', ad.ad_id!, enable);
                }}
                size="sm"
              />
              <button
                onClick={() => onDuplicate(platform, 'ad', ad.ad_id!, adsetId)}
                disabled={actionLoading[`dup:ad:${ad.ad_id}`]}
                className="p-1 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400"
                title="Duplicate"
              >
                {actionLoading[`dup:ad:${ad.ad_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
