import { Search, Loader2 } from 'lucide-react';
import { PLATFORM_BADGE } from '../constants';
import type { Account, DeliveryFilter } from '../types';

interface CampaignFiltersProps {
  platformFilter: string;
  setPlatformFilter: (p: string) => void;
  accountFilter: string;
  setAccountFilter: (a: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  deliveryFilter: DeliveryFilter;
  setDeliveryFilter: (f: DeliveryFilter) => void;
  accounts: Account[];
  loading: boolean;
}

export default function CampaignFilters({
  platformFilter,
  setPlatformFilter,
  accountFilter,
  setAccountFilter,
  searchQuery,
  setSearchQuery,
  deliveryFilter,
  setDeliveryFilter,
  accounts,
  loading,
}: CampaignFiltersProps) {
  const platformOptions = ['all', ...Array.from(new Set(
    accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token).map(a => a.platform)
  ))];

  const accountOptions = platformFilter === 'all'
    ? accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token)
    : accounts.filter(a => a.platform === platformFilter && a.status === 'active' && a.platform_account_id && a.has_access_token);

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* Platform pills */}
      {platformOptions.map(p => (
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

      {/* Account selector */}
      {accountOptions.length > 0 && (
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-ats-card border-ats-border text-ats-text hover:bg-ats-hover transition-colors focus:outline-none focus:border-ats-accent ml-1"
        >
          <option value="all">All Accounts</option>
          {accountOptions.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}{a.platform_account_id ? ` (${a.platform_account_id})` : ''}{platformFilter === 'all' ? ` — ${PLATFORM_BADGE[a.platform]?.label || a.platform}` : ''}
            </option>
          ))}
        </select>
      )}

      {/* Delivery filter */}
      <select
        value={deliveryFilter}
        onChange={(e) => setDeliveryFilter(e.target.value as DeliveryFilter)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-ats-card border-ats-border text-ats-text hover:bg-ats-hover transition-colors focus:outline-none focus:border-ats-accent"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>

      {/* Campaign search */}
      <div className="relative ml-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ats-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search campaigns..."
          className="pl-8 pr-3 py-1.5 w-48 rounded-lg text-xs border bg-ats-card border-ats-border text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent transition-colors"
        />
      </div>

      {loading && <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin ml-1" />}
    </div>
  );
}
