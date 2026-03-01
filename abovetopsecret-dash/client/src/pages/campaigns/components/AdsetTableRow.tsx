import { Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  DollarSign,
} from 'lucide-react';
import { fmt$, fmtNum, fmtRoas, fmtPct } from '../formatters';
import type { LiveAdset, LiveAd, ColumnDef } from '../types';
import StatusToggle from './StatusToggle';
import AdTableRow from './AdTableRow';

interface AdsetTableRowProps {
  adset: LiveAdset;
  platform: string;
  columns: ColumnDef[];
  expandedAds: Record<string, LiveAd[] | 'loading'>;
  adsetBudgets: Record<string, number>;
  adsetBidRates: Record<string, number>;
  actionLoading: Record<string, boolean>;
  statusOverrides: Record<string, boolean>;
  onToggleAdset: () => void;
  onStatusChange: (platform: string, entityType: string, entityId: string, enable: boolean) => Promise<void>;
  onDuplicate: (platform: string, entityType: string, entityId: string, parentId?: string) => void;
  onBudgetClick: (platform: string, entityId: string, currentBudget?: number, currentBidRate?: number) => void;
}

function getAdsetCellValue(as: LiveAdset, key: string, budget?: number): string {
  switch (key) {
    case 'spend': return fmt$(as.spend);
    case 'clicks': return fmtNum(as.clicks);
    case 'impressions': return fmtNum(as.impressions);
    case 'conversions': return fmtNum(as.conversions);
    case 'conversion_value': return fmt$(as.conversion_value);
    case 'roas': return fmtRoas(as.spend > 0 ? as.conversion_value / as.spend : 0);
    case 'cpa': return fmt$(as.conversions > 0 ? as.spend / as.conversions : 0);
    case 'net_profit': return fmt$(as.conversion_value - as.spend);
    case 'ctr': return fmtPct(as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0);
    case 'cpc': return fmt$(as.clicks > 0 ? as.spend / as.clicks : 0);
    case 'cpm': return fmt$(as.impressions > 0 ? (as.spend / as.impressions) * 1000 : 0);
    case 'daily_budget': return budget !== undefined ? `${fmt$(budget)}/day` : '—';
    default: return '—';
  }
}

export default function AdsetTableRow({
  adset: as,
  platform,
  columns,
  expandedAds,
  adsetBudgets,
  adsetBidRates,
  actionLoading,
  statusOverrides,
  onToggleAdset,
  onStatusChange,
  onDuplicate,
  onBudgetClick,
}: AdsetTableRowProps) {
  const asKey = `${platform}:${as.adset_id}`;
  const ads = expandedAds[asKey];
  const adsOpen = ads && ads !== 'loading';
  const currentBudget = adsetBudgets[as.adset_id];
  const currentBidRate = adsetBidRates[as.adset_id];

  return (
    <Fragment>
      <tr className="border-b border-ats-border/30 bg-ats-bg/50 hover:bg-ats-hover/30 cursor-pointer" onClick={onToggleAdset}>
        <td className="px-4 py-2.5 pl-10">
          {ads === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" /> :
            adsOpen ? <ChevronDown className="w-3.5 h-3.5 text-ats-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-ats-text-muted" />}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm text-ats-text">{as.adset_name || as.adset_id}</span>
          <span className="text-[10px] text-ats-text-muted ml-2">{as.ad_count} ads</span>
          {currentBudget !== undefined && (
            <span className="text-[10px] text-emerald-400/70 ml-2 font-mono">{fmt$(currentBudget)}/day</span>
          )}
          {currentBidRate !== undefined && (
            <span className="text-[10px] text-blue-400/70 ml-2 font-mono">bid {fmt$(currentBidRate / 100)}</span>
          )}
        </td>
        {/* Status */}
        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
          <StatusToggle
            enabled={statusOverrides[`adset:${as.adset_id}`] ?? true}
            onToggle={async (enable) => {
              await onStatusChange(platform, 'adset', as.adset_id, enable);
            }}
            size="sm"
          />
        </td>
        <td />
        {columns.map(col => (
          <td key={col.key} className={`px-4 py-2.5 text-right text-xs ${
            col.key === 'conversion_value' ? 'font-mono text-emerald-400' :
            col.key === 'spend' ? 'font-mono text-ats-text' :
            col.key === 'net_profit' ? `font-mono ${(as.conversion_value - as.spend) >= 0 ? 'text-emerald-400' : 'text-red-400'}` :
            col.key === 'daily_budget' ? 'font-mono text-emerald-400/70' :
            'text-ats-text-muted'
          }`}>
            {getAdsetCellValue(as, col.key, currentBudget)}
          </td>
        ))}
        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {actionLoading[`status:adset:${as.adset_id}`] ? <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" /> : (
              <>
                <button
                  onClick={() => onBudgetClick(platform, as.adset_id, currentBudget, currentBidRate)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold transition-colors"
                  title="Adjust Budget & Bid"
                >
                  <DollarSign className="w-3 h-3" />
                  {currentBudget !== undefined ? fmt$(currentBudget) : 'Budget'}
                </button>
                <button
                  onClick={() => onDuplicate(platform, 'adset', as.adset_id)}
                  disabled={actionLoading[`dup:adset:${as.adset_id}`]}
                  className="p-1.5 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400"
                  title="Duplicate"
                >
                  {actionLoading[`dup:adset:${as.adset_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Ads */}
      {adsOpen && (ads as LiveAd[]).map((ad, i) => (
        <AdTableRow
          key={`ad-${i}`}
          ad={ad}
          platform={platform}
          adsetId={as.adset_id}
          columns={columns}
          actionLoading={actionLoading}
          statusOverrides={statusOverrides}
          onStatusChange={onStatusChange}
          onDuplicate={onDuplicate}
        />
      ))}
    </Fragment>
  );
}
