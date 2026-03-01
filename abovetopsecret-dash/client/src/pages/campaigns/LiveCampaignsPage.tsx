import { useState } from 'react';
import { RefreshCw, Users, Layers, Plus, Radio, Loader2 } from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import useCampaignData from './hooks/useCampaignData';
import useColumnPrefs from './hooks/useColumnPrefs';
import useBulkSelection from './hooks/useBulkSelection';
import SummaryCards from './components/SummaryCards';
import CampaignFilters from './components/CampaignFilters';
import CampaignTable from './components/CampaignTable';
import BulkActionBar from './components/BulkActionBar';
import ColumnCustomizer from './components/ColumnCustomizer';
import BudgetModal from './components/BudgetModal';
import ConfirmModal from './components/ConfirmModal';
import CampaignCreator from './components/CampaignCreator';
import FormatLauncher from './components/FormatLauncher';
import AudienceManager from './components/AudienceManager';

export default function LiveCampaignsPage() {
  const data = useCampaignData();
  const { columns, visibleColumns, preset, applyPreset, toggleColumn } = useColumnPrefs();
  const { selectedCampaigns, toggleSelect, toggleSelectAll, clearSelection } = useBulkSelection();

  const [showCreator, setShowCreator] = useState(false);
  const [showFormatLauncher, setShowFormatLauncher] = useState(false);
  const [showAudienceManager, setShowAudienceManager] = useState(false);
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string; currentBudget?: number; currentBidRate?: number } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; description: string; onConfirm: () => Promise<void> } | null>(null);

  // Loading skeleton
  if (data.loading && data.campaigns.length === 0) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns" showDatePicker>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />)}
        </div>
      </PageShell>
    );
  }

  // Error state
  if (data.error) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns" showDatePicker>
        <div className="px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300">{data.error}</div>
      </PageShell>
    );
  }

  function requestStatusChange(platform: string, entityType: string, entityId: string, enable: boolean, entityName?: string) {
    const action = enable ? 'Enable' : 'Pause';
    const label = entityName ? `"${entityName}"` : `this ${entityType}`;
    setConfirmModal({
      title: `${action} ${entityType}?`,
      description: `${action} ${label}. This will update the platform and sync fresh data.`,
      onConfirm: () => data.handleStatusChange(platform, entityType, entityId, enable),
    });
  }

  return (
    <PageShell
      title="Campaign Manager"
      subtitle="Create, monitor & manage your campaigns"
      showDatePicker
      actions={
        <div className="flex items-center gap-2">
          <ColumnCustomizer
            visibleColumns={visibleColumns}
            preset={preset}
            onApplyPreset={applyPreset}
            onToggleColumn={toggleColumn}
          />
          <button onClick={data.load} className="p-2 rounded-lg text-ats-text-muted hover:bg-ats-hover transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${data.loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAudienceManager(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors"
            title="Audience Manager"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Audiences</span>
          </button>
          <button
            onClick={() => setShowFormatLauncher(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors"
            title="Format Template Launcher"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Batch</span>
          </button>
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Campaign</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      }
    >
      {/* Summary Cards */}
      <SummaryCards
        campaignCount={data.filteredCampaigns.length}
        spend={data.totals.spend}
        conversions={data.totals.conv}
        revenue={data.totals.rev}
        netProfit={data.totals.netProfit}
        isToday={data.dateRange.isToday}
      />

      {/* Filters */}
      <CampaignFilters
        platformFilter={data.platformFilter}
        setPlatformFilter={data.setPlatformFilter}
        accountFilter={data.accountFilter}
        setAccountFilter={data.setAccountFilter}
        searchQuery={data.searchQuery}
        setSearchQuery={data.setSearchQuery}
        deliveryFilter={data.deliveryFilter}
        setDeliveryFilter={data.setDeliveryFilter}
        accounts={data.accounts}
        loading={data.loading}
      />

      {/* Empty state */}
      {data.campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="w-12 h-12 text-ats-text-muted mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-ats-text mb-1">No active campaigns</h3>
          <p className="text-sm text-ats-text-muted max-w-sm mb-6">
            Create your first campaign to start driving results.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowFormatLauncher(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-ats-card border border-ats-border text-ats-text rounded-lg text-sm font-semibold hover:bg-ats-hover"
            >
              <Layers className="w-4 h-4" /> Batch Launch
            </button>
            <button
              onClick={() => setShowCreator(true)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Create Campaign
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          <BulkActionBar
            selectedCount={selectedCampaigns.size}
            accounts={data.accounts}
            onBulkPause={async () => {
              const ids = [...selectedCampaigns];
              await data.handleBulkStatusChange(ids, false);
              clearSelection();
            }}
            onBulkEnable={async () => {
              const ids = [...selectedCampaigns];
              await data.handleBulkStatusChange(ids, true);
              clearSelection();
            }}
            onBulkAssign={async (accountId) => {
              const ids = [...selectedCampaigns];
              await data.handleBulkAssign(ids, accountId);
              clearSelection();
            }}
            onClear={clearSelection}
          />

          {/* Campaign table */}
          <CampaignTable
            campaigns={data.sortedCampaigns}
            columns={columns}
            sortKey={data.sortKey}
            sortDir={data.sortDir}
            onSort={data.handleSort}
            expanded={data.expanded}
            expandedAds={data.expandedAds}
            adsetBudgets={data.adsetBudgets}
            adsetBidRates={data.adsetBidRates}
            adsetBidTypes={data.adsetBidTypes}
            actionLoading={data.actionLoading}
            statusOverrides={data.statusOverrides}
            selectedCampaigns={selectedCampaigns}
            assigningCampaign={data.assigningCampaign}
            campaignAccountMap={data.campaignAccountMap}
            accounts={data.accounts}
            onToggleCampaign={data.toggleCampaign}
            onToggleAdset={data.toggleAdset}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={() => toggleSelectAll(data.sortedCampaigns)}
            onStatusChange={async (platform, entityType, entityId, enable) => {
              requestStatusChange(platform, entityType, entityId, enable);
            }}
            onDuplicate={(platform, entityType, entityId, parentId) => {
              data.handleDuplicate(platform, entityType, entityId, parentId);
            }}
            onBudgetClick={(platform, entityId, currentBudget, currentBidRate) => {
              setBudgetModal({ platform, entityId, currentBudget, currentBidRate });
            }}
            onAssignCampaign={data.setAssigningCampaign}
            onAssignAccount={data.handleAssignAccount}
          />
        </>
      )}

      {/* Budget modal */}
      {budgetModal && (
        <BudgetModal
          platform={budgetModal.platform}
          entityId={budgetModal.entityId}
          currentBudget={budgetModal.currentBudget}
          currentBidRate={budgetModal.currentBidRate}
          onClose={() => setBudgetModal(null)}
          onSubmit={async (newBudget) => {
            await data.handleBudgetSubmit(budgetModal.platform, budgetModal.entityId, newBudget, budgetModal.currentBudget);
          }}
          onBidCapSubmit={budgetModal.platform === 'newsbreak' ? async (newBidCap) => {
            await data.handleBidCapSubmit(budgetModal.platform, budgetModal.entityId, newBidCap);
          } : undefined}
          onLoadActivityLog={data.loadActivityLog}
        />
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          description={confirmModal.description}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* Campaign creator */}
      {showCreator && <CampaignCreator onClose={() => setShowCreator(false)} onSuccess={data.load} accounts={data.accounts} />}

      {/* Format launcher */}
      {showFormatLauncher && <FormatLauncher onClose={() => setShowFormatLauncher(false)} onSuccess={data.load} accounts={data.accounts} />}

      {/* Audience manager */}
      {showAudienceManager && <AudienceManager onClose={() => setShowAudienceManager(false)} accounts={data.accounts} />}
    </PageShell>
  );
}
