import {
  Bot, LayoutDashboard, Target, Link2, Globe, Zap, Search,
  Users, Calendar, DollarSign, Telescope, Eye, Key, Database,
  Code, Upload, Settings, Plug, Edit3, Sliders, CreditCard,
  Bell, MapPin, TrendingUp, BarChart3, Funnel, Bookmark,
  Monitor, Cpu, FileKey, LogIn,
} from 'lucide-react';
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
  ACCOUNT: '/settings/account',
  RULES: '/rules',
} as const;

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    label: 'Operator',
    icon: Bot,
    path: ROUTES.OPERATOR,
  },
  {
    label: 'Summary',
    icon: LayoutDashboard,
    path: ROUTES.SUMMARY,
  },
  {
    label: 'Marketing Acquisition',
    icon: TrendingUp,
    children: [
      { label: 'Attribution', path: ROUTES.ATTRIBUTION, icon: Target },
      { label: 'Source / Medium', path: ROUTES.SOURCE_MEDIUM, icon: Link2 },
    ],
  },
  {
    label: 'Website Conversion',
    icon: Globe,
    children: [
      { label: 'Performance', path: ROUTES.WEBSITE_PERFORMANCE, icon: Zap },
      { label: 'Funnel', path: ROUTES.WEBSITE_FUNNEL, icon: Funnel },
      { label: 'Site Search', path: ROUTES.SITE_SEARCH, icon: Search },
    ],
  },
  {
    label: 'Customer Retention',
    icon: Users,
    children: [
      { label: 'Segments', path: ROUTES.CUSTOMER_SEGMENTS, icon: Bookmark },
      { label: 'Cohorts', path: ROUTES.COHORT_ANALYSIS, icon: Calendar },
      { label: 'LTV Analysis', path: ROUTES.LTV_ANALYSIS, icon: DollarSign },
    ],
  },
  {
    label: 'Discovery',
    icon: Telescope,
    children: [
      { label: 'Social Monitoring', path: ROUTES.SOCIAL_MONITORING, icon: Monitor },
      { label: 'AI Visibility', path: ROUTES.AI_VISIBILITY, icon: Eye },
      { label: 'Keyword Intel', path: ROUTES.KEYWORD_INTELLIGENCE, icon: Key },
    ],
  },
  {
    label: 'Data',
    icon: Database,
    children: [
      { label: 'Integrations', path: ROUTES.INTEGRATIONS, icon: Plug },
      { label: 'SQL Builder', path: ROUTES.SQL_BUILDER, icon: Code },
      { label: 'API Keys', path: ROUTES.API_KEYS, icon: FileKey },
      { label: 'Data Upload', path: ROUTES.DATA_UPLOAD, icon: Upload },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { label: 'Connections', path: ROUTES.CONNECTIONS, icon: Plug },
      { label: 'Overrides', path: ROUTES.OVERRIDES, icon: Edit3 },
      { label: 'General', path: ROUTES.GENERAL_SETTINGS, icon: Sliders },
      { label: 'Costs', path: ROUTES.COST_SETTINGS, icon: CreditCard },
      { label: 'Notifications', path: ROUTES.NOTIFICATIONS, icon: Bell },
      { label: 'Tracking', path: ROUTES.TRACKING, icon: MapPin },
    ],
  },
  {
    label: 'Rules',
    icon: Zap,
    path: ROUTES.RULES,
  },
];
