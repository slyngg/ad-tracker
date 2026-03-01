import { Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  DollarSign,
} from 'lucide-react';
import { PLATFORM_BADGE } from '../constants';
import { fmt$, fmtNum, fmtRoas, fmtPct } from '../formatters';
import type { LiveCampaign, LiveAdset, LiveAd, Account, ColumnDef } from '../types';
import StatusToggle from './StatusToggle';
import DeliveryBadge from './DeliveryBadge';
import AdsetTableRow from './AdsetTableRow';

interface CampaignTableRowProps {
  campaign: LiveCampaign;
  columns: ColumnDef[];
  isExpanded: boolean;
  isLoading: boolean;
  adsets: LiveAdset[] | null;
  expandedAds: Record<string, LiveAd[] | 'loading'>;
  adsetBudgets: Record<string, number>;
  adsetBidRates: Record<string, number>;
  actionLoading: Record<string, boolean>;
  statusOverrides: Record<string, boolean>;
  selected: boolean;
  assigningCampaign: string | null;
  campaignAccountMap: Record<string, number>;
  accounts: Account[];
  onToggleExpand: () => void;
  onToggleAdset: (platform: string, adsetId: string) => void;
  onToggleSelect: (campaignId: string) => void;
  onStatusChange: (platform: string, entityType: string, entityId: string, enable: boolean) => Promise<void>;
  onDuplicate: (platform: string, entityType: string, entityId: string, parentId?: string) => void;
  onBudgetClick: (platform: string, entityId: string, currentBudget?: number, currentBidRate?: number) => void;
  onAssignCampaign: (campaignId: string | null) => void;
  onAssignAccount: (campaignId: string, accountId: number) => void;
}

function getCellValue(c: LiveCampaign, key: string): string {
  switch (key) {
    case 'spend': return fmt$(c.spend);
    case 'clicks': return fmtNum(c.clicks);
    case 'impressions': return fmtNum(c.impressions);
    case 'conversions': return fmtNum(c.conversions);
    case 'conversion_value': return fmt$(c.conversion_value);
    case 'roas': return fmtRoas(c.roas);
    case 'cpa': return fmt$(c.cpa);
    case 'net_profit': return fmt$(c.conversion_value - c.spend);
    case 'ctr': return fmtPct(c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0);
    case 'cpc': return fmt$(c.clicks > 0 ? c.spend / c.clicks : 0);
    case 'cpm': return fmt$(c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0);
    case 'daily_budget': return c.daily_budget ? `${fmt$(c.daily_budget)}` : '—';
    default: return '—';
  }
}

function getCellClass(key: string, c: LiveCampaign): string {
  if (key === 'conversion_value') return 'text-emerald-400 font-mono';
  if (key === 'spend') return 'text-ats-text font-mono';
  if (key === 'net_profit') return (c.conversion_value - c.spend) >= 0 ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono';
  if (key === 'daily_budget') return 'text-ats-text-muted font-mono';
  return 'text-ats-text-muted';
}

export default function CampaignTableRow({
  campaign: c,
  columns,
  isExpanded,
  isLoading,
  adsets,
  expandedAds,
  adsetBudgets,
  adsetBidRates,
  actionLoading,
  statusOverrides,
  selected,
  assigningCampaign,
  campaignAccountMap,
  accounts,
  onToggleExpand,
  onToggleAdset,
  onToggleSelect,
  onStatusChange,
  onDuplicate,
  onBudgetClick,
  onAssignCampaign,
  onAssignAccount,
}: CampaignTableRowProps) {
  const key = `${c.platform}:${c.campaign_id}`;

  return (
    <Fragment>
      <tr className="border-b border-ats-border/50 hover:bg-ats-hover/50 transition-colors cursor-pointer" onClick={onToggleExpand}>
        {/* Checkbox */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(c.campaign_id)}
              onClick={e => e.stopPropagation()}
              className="w-3.5 h-3.5 rounded border-ats-border accent-ats-accent cursor-pointer"
            />
            {isLoading ? <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" /> :
              isExpanded ? <ChevronDown className="w-4 h-4 text-ats-text-muted" /> : <ChevronRight className="w-4 h-4 text-ats-text-muted" />}
          </div>
        </td>

        {/* Campaign name */}
        <td className="px-4 py-3">
          <div className="font-medium text-ats-text">{c.campaign_name || c.campaign_id}</div>
          <div className="text-[11px] text-ats-text-muted flex items-center gap-1 flex-wrap">
            {c.platform === 'newsbreak' ? (
              <span className="relative" onClick={e => { e.stopPropagation(); onAssignCampaign(assigningCampaign === c.campaign_id ? null : c.campaign_id); }}>
                <span className="underline decoration-dotted cursor-pointer hover:text-ats-text">{c.account_name}</span>
                {assigningCampaign === c.campaign_id && (
                  <div className="absolute left-0 top-5 z-50 bg-ats-card border border-ats-border rounded-lg shadow-xl py-1 min-w-[180px]">
                    {accounts.filter(a => a.platform === 'newsbreak' && a.status === 'active').map(a => (
                      <button key={a.id} onClick={e => { e.stopPropagation(); onAssignAccount(c.campaign_id, a.id); }}
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-ats-hover ${campaignAccountMap[c.campaign_id] === a.id ? 'text-ats-accent font-semibold' : 'text-ats-text'}`}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            ) : (
              <span>{c.account_name}</span>
            )}
            <span>&middot; {c.adset_count} adsets &middot; {c.ad_count} ads</span>
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <StatusToggle
              enabled={c.status === 'ACTIVE'}
              onToggle={async (enable) => {
                await onStatusChange(c.platform, 'campaign', c.campaign_id, enable);
              }}
            />
            <DeliveryBadge status={c.status} />
          </div>
        </td>

        {/* Platform */}
        <td className="px-4 py-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PLATFORM_BADGE[c.platform]?.bg} ${PLATFORM_BADGE[c.platform]?.text}`}>
            {PLATFORM_BADGE[c.platform]?.label}
          </span>
        </td>

        {/* Dynamic columns */}
        {columns.map(col => (
          <td key={col.key} className={`px-4 py-3 text-right ${getCellClass(col.key, c)}`}>
            {getCellValue(c, col.key)}
          </td>
        ))}

        {/* Actions */}
        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            <button
              onClick={() => onDuplicate(c.platform, 'campaign', c.campaign_id)}
              disabled={actionLoading[`dup:campaign:${c.campaign_id}`]}
              className="p-1.5 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400 transition-colors"
              title="Duplicate"
            >
              {actionLoading[`dup:campaign:${c.campaign_id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </td>
      </tr>

      {/* Adsets */}
      {isExpanded && adsets && adsets.map(as => (
        <AdsetTableRow
          key={`as-${c.platform}:${as.adset_id}`}
          adset={as}
          platform={c.platform}
          columns={columns}
          expandedAds={expandedAds}
          adsetBudgets={adsetBudgets}
          adsetBidRates={adsetBidRates}
          actionLoading={actionLoading}
          statusOverrides={statusOverrides}
          onToggleAdset={() => onToggleAdset(c.platform, as.adset_id)}
          onStatusChange={onStatusChange}
          onDuplicate={onDuplicate}
          onBudgetClick={onBudgetClick}
        />
      ))}
    </Fragment>
  );
}
