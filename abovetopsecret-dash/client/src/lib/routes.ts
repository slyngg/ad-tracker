import { NavSectionConfig } from '../types/navigation';

export const ROUTES = {
  SUMMARY: '/summary',
  OPERATOR: '/operator',
  ATTRIBUTION: '/acquisition/attribution',
  SOURCE_MEDIUM: '/acquisition/source-medium',
  WEBSITE_PERFORMANCE: '/website/performance',
  WEBSITE_FUNNEL: '/website/funnel',
  SITE_SEARCH: '/website/search',
  CUSTOMER_SEGMENTS: '/customers/segments',
  COHORT_ANALYSIS: '/customers/cohorts',
  LTV_ANALYSIS: '/customers/ltv',
  SOCIAL_MONITORING: '/discovery/social',
  AI_VISIBILITY: '/discovery/ai-visibility',
  KEYWORD_INTELLIGENCE: '/discovery/keywords',
  INTEGRATIONS: '/data/integrations',
  SQL_BUILDER: '/data/sql-builder',
  API_KEYS: '/data/api-keys',
  DATA_UPLOAD: '/data/upload',
  CONNECTIONS: '/settings/connections',
  OVERRIDES: '/settings/overrides',
  GENERAL_SETTINGS: '/settings/general',
  COST_SETTINGS: '/settings/costs',
  NOTIFICATIONS: '/settings/notifications',
  TRACKING: '/settings/tracking',
  RULES: '/rules',
} as const;

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    label: 'Operator',
    icon: '🤖',
    path: ROUTES.OPERATOR,
  },
  {
    label: 'Summary',
    icon: '📊',
    path: ROUTES.SUMMARY,
  },
  {
    label: 'Marketing Acquisition',
    icon: '📈',
    children: [
      { label: 'Attribution', path: ROUTES.ATTRIBUTION, icon: '🎯' },
      { label: 'Source / Medium', path: ROUTES.SOURCE_MEDIUM, icon: '🔗', disabled: true },
    ],
  },
  {
    label: 'Website Conversion',
    icon: '🌐',
    children: [
      { label: 'Performance', path: ROUTES.WEBSITE_PERFORMANCE, icon: '⚡', disabled: true },
      { label: 'Funnel', path: ROUTES.WEBSITE_FUNNEL, icon: '🔄', disabled: true },
      { label: 'Site Search', path: ROUTES.SITE_SEARCH, icon: '🔍', disabled: true },
    ],
  },
  {
    label: 'Customer Retention',
    icon: '👥',
    children: [
      { label: 'Segments', path: ROUTES.CUSTOMER_SEGMENTS, icon: '🏷️', disabled: true },
      { label: 'Cohorts', path: ROUTES.COHORT_ANALYSIS, icon: '📅', disabled: true },
      { label: 'LTV Analysis', path: ROUTES.LTV_ANALYSIS, icon: '💰', disabled: true },
    ],
  },
  {
    label: 'Discovery',
    icon: '🔭',
    children: [
      { label: 'Social Monitoring', path: ROUTES.SOCIAL_MONITORING, icon: '📱', disabled: true },
      { label: 'AI Visibility', path: ROUTES.AI_VISIBILITY, icon: '👁️', disabled: true },
      { label: 'Keyword Intel', path: ROUTES.KEYWORD_INTELLIGENCE, icon: '🔑', disabled: true },
    ],
  },
  {
    label: 'Data',
    icon: '🗄️',
    children: [
      { label: 'Integrations', path: ROUTES.INTEGRATIONS, icon: '🔌', disabled: true },
      { label: 'SQL Builder', path: ROUTES.SQL_BUILDER, icon: '💻', disabled: true },
      { label: 'API Keys', path: ROUTES.API_KEYS, icon: '🔐', disabled: true },
      { label: 'Data Upload', path: ROUTES.DATA_UPLOAD, icon: '📤', disabled: true },
    ],
  },
  {
    label: 'Settings',
    icon: '⚙️',
    children: [
      { label: 'Connections', path: ROUTES.CONNECTIONS, icon: '🔗' },
      { label: 'Overrides', path: ROUTES.OVERRIDES, icon: '✏️' },
      { label: 'General', path: ROUTES.GENERAL_SETTINGS, icon: '🛠️' },
      { label: 'Costs', path: ROUTES.COST_SETTINGS, icon: '💵', disabled: true },
      { label: 'Notifications', path: ROUTES.NOTIFICATIONS, icon: '🔔', disabled: true },
      { label: 'Tracking', path: ROUTES.TRACKING, icon: '📍', disabled: true },
    ],
  },
  {
    label: 'Rules',
    icon: '⚡',
    path: ROUTES.RULES,
  },
];
