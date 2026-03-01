import { ChevronDown, ArrowUpDown } from 'lucide-react';
import type { LiveCampaign, LiveAdset, LiveAd, Account, ColumnDef, SortKey, SortDir } from '../types';
import CampaignTableRow from './CampaignTableRow';
import TotalsRow from './TotalsRow';

interface CampaignTableProps {
  campaigns: LiveCampaign[];
  columns: ColumnDef[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  expanded: Record<string, LiveAdset[] | 'loading'>;
  expandedAds: Record<string, LiveAd[] | 'loading'>;
  adsetBudgets: Record<string, number>;
  adsetBidRates: Record<string, number>;
  adsetBidTypes: Record<string, string>;
  actionLoading: Record<string, boolean>;
  statusOverrides: Record<string, boolean>;
  selectedCampaigns: Set<string>;
  assigningCampaign: string | null;
  campaignAccountMap: Record<string, number>;
  accounts: Account[];
  onToggleCampaign: (c: LiveCampaign) => void;
  onToggleAdset: (platform: string, adsetId: string) => void;
  onToggleSelect: (campaignId: string) => void;
  onToggleSelectAll: () => void;
  onStatusChange: (platform: string, entityType: string, entityId: string, enable: boolean) => Promise<void>;
  onDuplicate: (platform: string, entityType: string, entityId: string, parentId?: string) => void;
  onBudgetClick: (platform: string, entityId: string, currentBudget?: number, currentBidRate?: number) => void;
  onAssignCampaign: (campaignId: string | null) => void;
  onAssignAccount: (campaignId: string, accountId: number) => void;
}

function TH({ children, align = 'right', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  const alignCls = align === 'left' ? 'text-left' : 'text-right';
  return (
    <th className={`${alignCls} px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium ${className}`}>
      {children}
    </th>
  );
}

function SortTH({ label, sortKey, currentKey, dir, onSort, align = 'right' }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === currentKey;
  const alignCls = align === 'left' ? 'text-left' : 'text-right';
  return (
    <th
      className={`${alignCls} px-4 py-3 text-[11px] uppercase tracking-wide font-medium cursor-pointer select-none hover:text-ats-text transition-colors ${active ? 'text-ats-accent' : 'text-ats-text-muted'}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 rotate-180" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

export default function CampaignTable({
  campaigns,
  columns,
  sortKey,
  sortDir,
  onSort,
  expanded,
  expandedAds,
  adsetBudgets,
  adsetBidRates,
  adsetBidTypes,
  actionLoading,
  statusOverrides,
  selectedCampaigns,
  assigningCampaign,
  campaignAccountMap,
  accounts,
  onToggleCampaign,
  onToggleAdset,
  onToggleSelect,
  onToggleSelectAll,
  onStatusChange,
  onDuplicate,
  onBudgetClick,
  onAssignCampaign,
  onAssignAccount,
}: CampaignTableProps) {
  return (
    <div className="bg-ats-card border border-ats-border rounded-xl overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-ats-border">
            <TH className="w-8" align="left">
              <input
                type="checkbox"
                checked={selectedCampaigns.size > 0 && selectedCampaigns.size === campaigns.length}
                onChange={onToggleSelectAll}
                className="w-3.5 h-3.5 rounded border-ats-border accent-ats-accent cursor-pointer"
              />
            </TH>
            <SortTH label="Campaign" sortKey="campaign_name" currentKey={sortKey} dir={sortDir} onSort={onSort} align="left" />
            <TH align="left">Status</TH>
            <TH align="left">Platform</TH>
            {columns.map(col => (
              col.sortable ? (
                <SortTH
                  key={col.key}
                  label={col.shortLabel || col.label}
                  sortKey={col.key as SortKey}
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
              ) : (
                <TH key={col.key}>{col.shortLabel || col.label}</TH>
              )
            ))}
            <TH className="w-24">Actions</TH>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => {
            const key = `${c.platform}:${c.campaign_id}`;
            const adsets = expanded[key];
            const isExpanded = adsets && adsets !== 'loading';
            const isLoading = adsets === 'loading';

            return (
              <CampaignTableRow
                key={key}
                campaign={c}
                columns={columns}
                isExpanded={!!isExpanded}
                isLoading={!!isLoading}
                adsets={isExpanded ? (adsets as LiveAdset[]) : null}
                expandedAds={expandedAds}
                adsetBudgets={adsetBudgets}
                adsetBidRates={adsetBidRates}
                adsetBidTypes={adsetBidTypes}
                actionLoading={actionLoading}
                statusOverrides={statusOverrides}
                selected={selectedCampaigns.has(c.campaign_id)}
                assigningCampaign={assigningCampaign}
                campaignAccountMap={campaignAccountMap}
                accounts={accounts}
                onToggleExpand={() => onToggleCampaign(c)}
                onToggleAdset={onToggleAdset}
                onToggleSelect={onToggleSelect}
                onStatusChange={onStatusChange}
                onDuplicate={onDuplicate}
                onBudgetClick={onBudgetClick}
                onAssignCampaign={onAssignCampaign}
                onAssignAccount={onAssignAccount}
              />
            );
          })}
        </tbody>
        <TotalsRow campaigns={campaigns} columns={columns} hasCheckbox={true} />
      </table>
    </div>
  );
}
