export const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  all:       { bg: '',                 text: '',                label: 'All' },
  meta:      { bg: 'bg-blue-500/15',   text: 'text-blue-400',   label: 'Meta' },
  tiktok:    { bg: 'bg-pink-500/15',   text: 'text-pink-400',   label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
  google:    { bg: 'bg-violet-500/15', text: 'text-violet-400', label: 'Google' },
};

export const OBJECTIVES: Record<string, { value: string; label: string }[]> = {
  newsbreak: [
    { value: 'TRAFFIC',         label: 'Traffic' },
    { value: 'CONVERSIONS',     label: 'Conversions' },
    { value: 'AWARENESS',       label: 'Awareness' },
    { value: 'ENGAGEMENT',      label: 'Engagement' },
    { value: 'APP_INSTALLS',    label: 'App Installs' },
    { value: 'LEAD_GENERATION', label: 'Lead Generation' },
  ],
  meta: [
    { value: 'OUTCOME_TRAFFIC',     label: 'Traffic' },
    { value: 'OUTCOME_SALES',       label: 'Sales / Conversions' },
    { value: 'OUTCOME_ENGAGEMENT',  label: 'Engagement' },
    { value: 'OUTCOME_LEADS',       label: 'Leads' },
    { value: 'OUTCOME_AWARENESS',   label: 'Awareness' },
  ],
  tiktok: [
    { value: 'TRAFFIC',     label: 'Traffic' },
    { value: 'CONVERSIONS', label: 'Conversions' },
    { value: 'REACH',       label: 'Reach' },
    { value: 'APP_INSTALL', label: 'App Install' },
  ],
};

export const CTA_OPTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
  'CONTACT_US', 'GET_OFFER', 'SUBSCRIBE', 'APPLY_NOW', 'GET_QUOTE',
];

export const EVENTS = [
  { value: 'Purchase', label: 'Purchase' },
  { value: 'AddToCart', label: 'Add to Cart' },
  { value: 'Lead', label: 'Lead' },
  { value: 'CompleteRegistration', label: 'Complete Registration' },
  { value: 'ViewContent', label: 'View Content' },
  { value: 'InitiateCheckout', label: 'Initiate Checkout' },
  { value: 'Search', label: 'Search' },
  { value: 'PageView', label: 'Page View' },
];

export const NB_PLACEMENTS = [
  { value: 'ALL', label: 'All Placements' },
  { value: 'NEWSBREAK', label: 'NewsBreak' },
  { value: 'SCOOPZ', label: 'Scoopz' },
  { value: 'UNLIMITED', label: 'Unlimited' },
  { value: 'PREMIUM_PARTNERS', label: 'Premium Partners' },
];

export const DYNAMIC_VARS = [
  { var: '{city}', label: 'City' },
  { var: '{state}', label: 'State' },
  { var: '{year}', label: 'Year' },
  { var: '{month}', label: 'Month' },
  { var: '{day_of_week}', label: 'Day' },
  { var: '{date}', label: 'Date' },
  { var: '{os}', label: 'OS' },
];

export const FORMAT_PRESETS = [
  { format: '1-1-1', label: '1-1-1', desc: '1 campaign, 1 ad set, 1 ad' },
  { format: '1-3-1', label: '1-3-1', desc: '1 campaign, 3 ad sets, 1 ad each' },
  { format: '1-5-1', label: '1-5-1', desc: '1 campaign, 5 ad sets, 1 ad each' },
  { format: '1-1-3', label: '1-1-3', desc: '1 campaign, 1 ad set, 3 ads' },
  { format: '1-3-3', label: '1-3-3', desc: '1 campaign, 3 ad sets, 3 ads each' },
];

export const COLUMN_PRESETS = {
  performance: ['spend', 'conversions', 'conversion_value', 'roas', 'cpa', 'net_profit'] as const,
  engagement: ['spend', 'clicks', 'impressions', 'ctr', 'cpc', 'cpm'] as const,
  all: ['spend', 'clicks', 'impressions', 'conversions', 'conversion_value', 'roas', 'cpa', 'net_profit', 'ctr', 'cpc', 'cpm', 'daily_budget'] as const,
};
