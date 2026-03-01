import type { LiveCampaign, LiveAdset, LiveAd, Account, AdGroupBudget, ActivityLogEntry, NewsBreakAudience, CampaignTemplate } from '../../lib/api';

export type SortKey = 'spend' | 'clicks' | 'impressions' | 'conversions' | 'conversion_value' | 'roas' | 'cpa' | 'net_profit' | 'ctr' | 'campaign_name' | 'daily_budget';
export type SortDir = 'asc' | 'desc';
export type DeliveryFilter = 'all' | 'active' | 'paused';
export type ColumnPreset = 'performance' | 'engagement' | 'all' | 'custom';

export interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  align: 'left' | 'right';
  sortable: boolean;
  format?: (value: number) => string;
  className?: string;
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'spend', label: 'Spend', align: 'right', sortable: true },
  { key: 'clicks', label: 'Clicks', align: 'right', sortable: true },
  { key: 'impressions', label: 'Impressions', shortLabel: 'Impr.', align: 'right', sortable: true },
  { key: 'conversions', label: 'Conversions', shortLabel: 'Conv.', align: 'right', sortable: true },
  { key: 'conversion_value', label: 'Revenue', align: 'right', sortable: true },
  { key: 'roas', label: 'ROAS', align: 'right', sortable: true },
  { key: 'cpa', label: 'CPA', align: 'right', sortable: true },
  { key: 'net_profit', label: 'Net Profit', align: 'right', sortable: true },
  { key: 'ctr', label: 'CTR', align: 'right', sortable: true },
  { key: 'cpc', label: 'CPC', align: 'right', sortable: false },
  { key: 'cpm', label: 'CPM', align: 'right', sortable: false },
  { key: 'daily_budget', label: 'Budget', align: 'right', sortable: true },
  { key: 'bid_type', label: 'Bid Type', align: 'right', sortable: false },
  { key: 'bid_rate', label: 'Bid Rate', align: 'right', sortable: false },
];

export interface CreatorState {
  platform: string;
  accountId: number | undefined;
  campaignName: string;
  objective: string;
  adsetName: string;
  budgetType: 'daily' | 'lifetime';
  dailyBudget: string;
  scheduleStart: string;
  scheduleEnd: string;
  eventType: string;
  placements: string[];
  gender: 'all' | 'male' | 'female';
  ageMin: string;
  ageMax: string;
  locations: string;
  languages: string;
  audienceList: string;
  optimizationGoal: string;
  bidType: string;
  bidAmount: string;
  adName: string;
  headline: string;
  adText: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  landingUrl: string;
  cta: string;
  brandName: string;
  buttonText: string;
  thumbnailUrl: string;
}

export const INITIAL_CREATOR: CreatorState = {
  platform: 'newsbreak',
  accountId: undefined,
  campaignName: '',
  objective: 'TRAFFIC',
  adsetName: '',
  budgetType: 'daily',
  dailyBudget: '10',
  scheduleStart: '',
  scheduleEnd: '',
  eventType: '',
  placements: ['ALL'],
  gender: 'all',
  ageMin: '18',
  ageMax: '65',
  locations: '',
  languages: '',
  audienceList: '',
  optimizationGoal: 'CONVERSIONS',
  bidType: 'LOWEST_COST_WITHOUT_CAP',
  bidAmount: '',
  adName: '',
  headline: '',
  adText: '',
  mediaType: 'image',
  mediaUrl: '',
  landingUrl: '',
  cta: 'LEARN_MORE',
  brandName: '',
  buttonText: '',
  thumbnailUrl: '',
};

// Re-export types used across components
export type { LiveCampaign, LiveAdset, LiveAd, Account, AdGroupBudget, ActivityLogEntry, NewsBreakAudience, CampaignTemplate };
