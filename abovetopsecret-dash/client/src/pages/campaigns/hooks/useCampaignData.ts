import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchLiveCampaigns,
  fetchLiveAdsets,
  fetchLiveAds,
  fetchAccounts,
  fetchAdGroupBudgets,
  fetchCampaignAccountMap,
  updateLiveEntityStatus,
  updateLiveEntityBudget,
  updateLiveEntityBidCap,
  duplicateLiveEntity,
  triggerPlatformSync,
  fetchActivityLog,
  assignCampaignAccount,
  bulkAssignCampaignAccount,
} from '../../../lib/api';
import type { LiveCampaign, LiveAdset, LiveAd, Account, AdGroupBudget, ActivityLogEntry, SortKey, SortDir, DeliveryFilter } from '../types';
import { useDateRangeStore } from '../../../stores/dateRangeStore';

export default function useCampaignData() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [adsetBudgets, setAdsetBudgets] = useState<Record<string, number>>({});
  const [adsetBidRates, setAdsetBidRates] = useState<Record<string, number>>({});
  const [adsetBidTypes, setAdsetBidTypes] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, boolean>>({});
  const [campaignAccountMap, setCampaignAccountMap] = useState<Record<string, number>>({});
  const [assigningCampaign, setAssigningCampaign] = useState<string | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Date range
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const toIso = (d: Date) => d.toISOString().split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpanded({});
    setExpandedAds({});
    setStatusOverrides({});
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      setCampaigns(await fetchLiveCampaigns(platformFilter, startDate, endDate, accountFilter));
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [platformFilter, accountFilter, dateRange]);

  useEffect(() => {
    load();
    fetchAccounts().then(setAccounts).catch(() => {});
    fetchCampaignAccountMap().then(maps => {
      const m: Record<string, number> = {};
      for (const row of maps) m[row.campaign_id] = row.account_id;
      setCampaignAccountMap(m);
    }).catch(() => {});
  }, [load]);

  // Reset account filter when platform changes
  useEffect(() => {
    setAccountFilter('all');
  }, [platformFilter]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // Filter campaigns
  const filteredCampaigns = useMemo(() => {
    let result = campaigns;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => c.campaign_name?.toLowerCase().includes(q));
    }

    // Delivery filter
    if (deliveryFilter !== 'all') {
      result = result.filter(c => {
        if (deliveryFilter === 'active') return c.status === 'ACTIVE';
        if (deliveryFilter === 'paused') return c.status === 'PAUSED';
        return true;
      });
    }

    return result;
  }, [campaigns, searchQuery, deliveryFilter]);

  // Sort campaigns
  const sortedCampaigns = useMemo(() => {
    return [...filteredCampaigns].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'net_profit') {
        av = a.conversion_value - a.spend;
        bv = b.conversion_value - b.spend;
      } else if (sortKey === 'ctr') {
        av = a.impressions > 0 ? a.clicks / a.impressions : 0;
        bv = b.impressions > 0 ? b.clicks / b.impressions : 0;
      } else if (sortKey === 'daily_budget') {
        av = a.daily_budget || 0;
        bv = b.daily_budget || 0;
      } else {
        av = (a as any)[sortKey];
        bv = (b as any)[sortKey];
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filteredCampaigns, sortKey, sortDir]);

  // Totals
  const totals = useMemo(() => {
    return filteredCampaigns.reduce(
      (a, c) => ({
        spend: a.spend + c.spend,
        conv: a.conv + c.conversions,
        rev: a.rev + c.conversion_value,
        netProfit: a.netProfit + (c.conversion_value - c.spend),
      }),
      { spend: 0, conv: 0, rev: 0, netProfit: 0 }
    );
  }, [filteredCampaigns]);

  async function toggleCampaign(c: LiveCampaign) {
    const key = `${c.platform}:${c.campaign_id}`;
    if (expanded[key] && expanded[key] !== 'loading') {
      setExpanded(p => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setExpanded(p => ({ ...p, [key]: 'loading' }));
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      const [data, budgets] = await Promise.all([
        fetchLiveAdsets(c.platform, c.campaign_id, startDate, endDate),
        fetchAdGroupBudgets(c.platform, c.campaign_id).catch(() => [] as AdGroupBudget[]),
      ]);
      setExpanded(p => ({ ...p, [key]: data }));
      if (budgets.length > 0) {
        setAdsetBudgets(prev => {
          const next = { ...prev };
          for (const b of budgets) next[b.adgroup_id] = b.budget;
          return next;
        });
        setAdsetBidRates(prev => {
          const next = { ...prev };
          for (const b of budgets) {
            if (b.bid_rate != null) next[b.adgroup_id] = b.bid_rate;
          }
          return next;
        });
        setAdsetBidTypes(prev => {
          const next = { ...prev };
          for (const b of budgets) {
            if (b.bid_type) next[b.adgroup_id] = b.bid_type;
          }
          return next;
        });
      }
    } catch {
      setExpanded(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  async function toggleAdset(platform: string, adsetId: string) {
    const key = `${platform}:${adsetId}`;
    if (expandedAds[key] && expandedAds[key] !== 'loading') {
      setExpandedAds(p => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setExpandedAds(p => ({ ...p, [key]: 'loading' }));
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      const data = await fetchLiveAds(platform, adsetId, startDate, endDate);
      setExpandedAds(p => ({ ...p, [key]: data }));
    } catch {
      setExpandedAds(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  async function handleStatusChange(platform: string, entityType: string, entityId: string, enable: boolean) {
    const key = `status:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityStatus(platform, entityType, entityId, enable ? 'ENABLE' : 'DISABLE');
      // Update status locally instead of reloading (which collapses the tree)
      setStatusOverrides(p => ({ ...p, [`${entityType}:${entityId}`]: enable }));
      if (entityType === 'campaign') {
        setCampaigns(prev => prev.map(c =>
          c.campaign_id === entityId ? { ...c, status: enable ? 'ACTIVE' as const : 'PAUSED' as const } : c
        ));
      }
      triggerPlatformSync(platform).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed');
      throw err;
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleBudgetSubmit(platform: string, entityId: string, newBudget: number, oldBudget?: number) {
    const key = `budget:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityBudget(platform, entityId, newBudget, oldBudget);
      setAdsetBudgets(prev => ({ ...prev, [entityId]: newBudget }));
      triggerPlatformSync(platform).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed');
      throw err;
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleBidCapSubmit(platform: string, entityId: string, newBidCap: number) {
    const key = `bid:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityBidCap(platform, entityId, newBidCap);
      setAdsetBidRates(prev => ({ ...prev, [entityId]: Math.round(newBidCap * 100) }));
      triggerPlatformSync(platform).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed');
      throw err;
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleDuplicate(platformName: string, entityType: string, entityId: number | string, targetParentId?: string) {
    const key = `dup:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await duplicateLiveEntity(entityType, entityId, targetParentId, platformName);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleAssignAccount(campaignId: string, accountId: number) {
    try {
      await assignCampaignAccount(campaignId, accountId);
      setCampaignAccountMap(prev => ({ ...prev, [campaignId]: accountId }));
      setAssigningCampaign(null);
      load();
    } catch (err: any) {
      console.error('Failed to assign account:', err);
    }
  }

  async function handleBulkAssign(campaignIds: string[], accountId: number) {
    try {
      await bulkAssignCampaignAccount(campaignIds, accountId);
      setCampaignAccountMap(prev => {
        const next = { ...prev };
        for (const cid of campaignIds) next[cid] = accountId;
        return next;
      });
      load();
    } catch (err: any) {
      console.error('Bulk assign failed:', err);
    }
  }

  async function handleBulkStatusChange(campaignIds: string[], enable: boolean) {
    for (const cid of campaignIds) {
      const c = campaigns.find(camp => camp.campaign_id === cid);
      if (c) {
        try {
          await updateLiveEntityStatus(c.platform, 'campaign', cid, enable ? 'ENABLE' : 'DISABLE');
        } catch {}
      }
    }
    await load();
  }

  async function loadActivityLog(entityId: string): Promise<ActivityLogEntry[]> {
    try {
      return await fetchActivityLog(entityId);
    } catch {
      return [];
    }
  }

  return {
    // Data
    campaigns,
    sortedCampaigns,
    filteredCampaigns,
    totals,
    loading,
    error,
    accounts,
    expanded,
    expandedAds,
    adsetBudgets,
    adsetBidRates,
    adsetBidTypes,
    actionLoading,
    statusOverrides,
    campaignAccountMap,
    assigningCampaign,
    dateRange,

    // Filters
    platformFilter,
    setPlatformFilter,
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    deliveryFilter,
    setDeliveryFilter,

    // Sort
    sortKey,
    sortDir,
    handleSort,

    // Actions
    load,
    toggleCampaign,
    toggleAdset,
    handleStatusChange,
    handleBudgetSubmit,
    handleBidCapSubmit,
    handleDuplicate,
    handleAssignAccount,
    handleBulkAssign,
    handleBulkStatusChange,
    setAssigningCampaign,
    loadActivityLog,
  };
}
