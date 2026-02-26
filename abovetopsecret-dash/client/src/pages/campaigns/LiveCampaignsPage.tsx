import { useState, useEffect } from 'react';
import {
  fetchLiveCampaigns,
  fetchLiveAdsets,
  fetchLiveAds,
  updateLiveEntityStatus,
  updateLiveEntityBudget,
  LiveCampaign,
  LiveAdset,
  LiveAd,
} from '../../lib/api';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  DollarSign,
  Radio,
} from 'lucide-react';
import PageShell from '../../components/shared/PageShell';

const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  all: { bg: '', text: '', label: 'All Platforms' },
  meta: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Meta' },
  tiktok: { bg: 'bg-pink-500/15', text: 'text-pink-400', label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
};

function fmt$(v: number) {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number) {
  return v.toLocaleString();
}
function fmtRoas(v: number) {
  return v.toFixed(2) + 'x';
}

export default function LiveCampaignsPage() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');

  // Expanded state: campaign_id -> adsets
  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  // Expanded adset -> ads
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string; current: number } | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  useEffect(() => {
    load();
  }, [platformFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLiveCampaigns(platformFilter);
      setCampaigns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load live campaigns');
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaign(c: LiveCampaign) {
    const key = `${c.platform}:${c.campaign_id}`;
    if (expanded[key] && expanded[key] !== 'loading') {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setExpanded((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const adsets = await fetchLiveAdsets(c.platform, c.campaign_id);
      setExpanded((prev) => ({ ...prev, [key]: adsets }));
    } catch {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function toggleAdset(platform: string, adsetId: string) {
    const key = `${platform}:${adsetId}`;
    if (expandedAds[key] && expandedAds[key] !== 'loading') {
      setExpandedAds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setExpandedAds((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const ads = await fetchLiveAds(platform, adsetId);
      setExpandedAds((prev) => ({ ...prev, [key]: ads }));
    } catch {
      setExpandedAds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleStatusToggle(platform: string, entityType: string, entityId: string, enable: boolean) {
    const key = `status:${entityType}:${entityId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await updateLiveEntityStatus(platform, entityType, entityId, enable ? 'ENABLE' : 'DISABLE');
      // Refresh
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleBudgetSubmit() {
    if (!budgetModal) return;
    const val = parseFloat(budgetValue);
    if (isNaN(val) || val < 5) {
      alert('Budget must be at least $5.00');
      return;
    }
    const key = `budget:${budgetModal.entityId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await updateLiveEntityBudget(budgetModal.platform, budgetModal.entityId, val);
      setBudgetModal(null);
      setBudgetValue('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust budget');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  if (loading) {
    return (
      <PageShell title="Live Campaigns" subtitle="Active campaigns across all platforms">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Live Campaigns" subtitle="Active campaigns across all platforms">
        <div className="px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  // Summary totals
  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      conversions: acc.conversions + c.conversions,
      revenue: acc.revenue + c.conversion_value,
    }),
    { spend: 0, conversions: 0, revenue: 0 }
  );

  return (
    <PageShell title="Live Campaigns" subtitle="Active campaigns across all platforms">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card border border-ats-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">Campaigns</div>
          <div className="text-xl font-bold text-ats-text">{campaigns.length}</div>
        </div>
        <div className="bg-ats-card border border-ats-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">Total Spend</div>
          <div className="text-xl font-bold text-ats-text">{fmt$(totals.spend)}</div>
        </div>
        <div className="bg-ats-card border border-ats-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">Conversions</div>
          <div className="text-xl font-bold text-ats-text">{fmtNum(totals.conversions)}</div>
        </div>
        <div className="bg-ats-card border border-ats-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">Revenue</div>
          <div className="text-xl font-bold text-emerald-400">{fmt$(totals.revenue)}</div>
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex items-center gap-2 mb-4">
        {['all', 'meta', 'tiktok', 'newsbreak'].map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              platformFilter === p
                ? 'bg-ats-accent/20 border-ats-accent text-ats-accent'
                : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            {PLATFORM_BADGE[p]?.label || p}
          </button>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="w-12 h-12 text-ats-text-muted mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-ats-text mb-1">No live campaigns</h3>
          <p className="text-sm text-ats-text-muted max-w-sm">
            No active campaigns found for today. Data syncs every 2 minutes.
          </p>
        </div>
      ) : (
        <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium w-8" />
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Campaign</th>
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden md:table-cell">Platform</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Spend</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden sm:table-cell">Clicks</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden lg:table-cell">Impressions</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden md:table-cell">Conv.</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Revenue</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden sm:table-cell">ROAS</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const key = `${c.platform}:${c.campaign_id}`;
                const adsets = expanded[key];
                const isExpanded = adsets && adsets !== 'loading';
                const isLoading = adsets === 'loading';

                return (
                  <>
                    {/* Campaign row */}
                    <tr
                      key={key}
                      className="border-b border-ats-border/50 hover:bg-ats-hover/50 transition-colors cursor-pointer"
                      onClick={() => toggleCampaign(c)}
                    >
                      <td className="px-4 py-3">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" />
                        ) : isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-ats-text-muted" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-ats-text-muted" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ats-text">{c.campaign_name || c.campaign_id}</div>
                        <div className="text-[11px] text-ats-text-muted">{c.account_name} &middot; {c.adset_count} adsets &middot; {c.ad_count} ads</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PLATFORM_BADGE[c.platform]?.bg} ${PLATFORM_BADGE[c.platform]?.text}`}>
                          {PLATFORM_BADGE[c.platform]?.label || c.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ats-text">{fmt$(c.spend)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden sm:table-cell">{fmtNum(c.clicks)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden lg:table-cell">{fmtNum(c.impressions)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden md:table-cell">{fmtNum(c.conversions)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt$(c.conversion_value)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden sm:table-cell">{fmtRoas(c.roas)}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {actionLoading[`status:campaign:${c.campaign_id}`] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" />
                          ) : (
                            <button
                              onClick={() => handleStatusToggle(c.platform, 'campaign', c.campaign_id, false)}
                              className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors"
                              title="Pause campaign"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Adset rows */}
                    {isExpanded && Array.isArray(adsets) && adsets.map((as) => {
                      const asKey = `${c.platform}:${as.adset_id}`;
                      const ads = expandedAds[asKey];
                      const adsExpanded = ads && ads !== 'loading';
                      const adsLoading = ads === 'loading';

                      return (
                        <>
                          <tr
                            key={`adset-${asKey}`}
                            className="border-b border-ats-border/30 bg-ats-bg/50 hover:bg-ats-hover/30 transition-colors cursor-pointer"
                            onClick={() => toggleAdset(c.platform, as.adset_id)}
                          >
                            <td className="px-4 py-2.5 pl-10">
                              {adsLoading ? (
                                <Loader2 className="w-3.5 h-3.5 text-ats-text-muted animate-spin" />
                              ) : adsExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-ats-text-muted" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-ats-text-muted" />
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="text-sm text-ats-text">{as.adset_name || as.adset_id}</div>
                              <div className="text-[10px] text-ats-text-muted">{as.ad_count} ads</div>
                            </td>
                            <td className="hidden md:table-cell" />
                            <td className="px-4 py-2.5 text-right font-mono text-ats-text text-xs">{fmt$(as.spend)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden sm:table-cell">{fmtNum(as.clicks)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden lg:table-cell">{fmtNum(as.impressions)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden md:table-cell">{fmtNum(as.conversions)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-400 text-xs">{fmt$(as.conversion_value)}</td>
                            <td className="hidden sm:table-cell" />
                            <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {actionLoading[`status:adset:${as.adset_id}`] ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" />
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleStatusToggle(c.platform, 'adset', as.adset_id, false)}
                                      className="p-1 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors"
                                      title="Pause adset"
                                    >
                                      <Pause className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setBudgetModal({ platform: c.platform, entityId: as.adset_id, current: as.spend });
                                        setBudgetValue('');
                                      }}
                                      className="p-1 rounded-md hover:bg-emerald-500/20 text-ats-text-muted hover:text-emerald-400 transition-colors"
                                      title="Adjust budget"
                                    >
                                      <DollarSign className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Ad rows */}
                          {adsExpanded && Array.isArray(ads) && ads.map((ad, idx) => (
                            <tr
                              key={`ad-${asKey}-${idx}`}
                              className="border-b border-ats-border/20 bg-ats-bg/30"
                            >
                              <td className="px-4 py-2 pl-16" />
                              <td className="px-4 py-2">
                                <span className="text-xs text-ats-text-muted">{ad.ad_name || ad.ad_id || 'Unnamed ad'}</span>
                              </td>
                              <td className="hidden md:table-cell" />
                              <td className="px-4 py-2 text-right font-mono text-ats-text text-[11px]">{fmt$(ad.spend)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden sm:table-cell">{fmtNum(ad.clicks)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden lg:table-cell">{fmtNum(ad.impressions)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden md:table-cell">{fmtNum(ad.conversions)}</td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[11px]">{fmt$(ad.conversion_value)}</td>
                              <td className="hidden sm:table-cell" />
                              <td />
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Budget modal */}
      {budgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setBudgetModal(null)}>
          <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ats-text mb-4">Adjust Daily Budget</h3>
            <div className="mb-4">
              <label className="block text-xs text-ats-text-muted mb-1.5">New daily budget (USD)</label>
              <input
                type="number"
                min="5"
                step="1"
                value={budgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
                autoFocus
              />
              <p className="text-[10px] text-ats-text-muted mt-1">Minimum $5.00</p>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setBudgetModal(null)}
                className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBudgetSubmit}
                disabled={actionLoading[`budget:${budgetModal.entityId}`]}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {actionLoading[`budget:${budgetModal.entityId}`] ? 'Saving...' : 'Update Budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
