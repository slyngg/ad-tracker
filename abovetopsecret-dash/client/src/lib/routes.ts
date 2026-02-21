import {
  Bot, LayoutDashboard, Target, Link2, Globe, Zap, Search,
  Users, Calendar, DollarSign, Telescope, Eye, Key, Database,
  Code, Upload, Settings, Plug, Edit3, Sliders, CreditCard,
  Bell, MapPin, TrendingUp, BarChart3, Funnel, Bookmark,
  Monitor, Cpu, FileKey, LogIn, Brain, LayoutGrid,
  Package, ShoppingCart, BarChart2, Repeat, UserPlus,
  Palette, Clock, Shield, BookOpen, Compass, Layers,
  MessageSquare, FileText, Sparkles, PenTool, PieChart,
  Library, LayoutList, Radar, Building2,
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
  MEMORIES: '/settings/memories',
  WIDGET: '/settings/widget',
  RULES: '/rules',

  // Website Conversion — new
  BUNDLE_ANALYSIS: '/website/bundles',
  PRODUCT_JOURNEY: '/website/product-journey',
  PRODUCT_ANALYSIS: '/website/products',

  // Creative Analysis
  CREATIVE_ANALYSIS: '/creative/analysis',
  CREATIVE_ANALYTICS: '/creative/analytics',
  CREATIVE_DIVERSITY: '/creative/diversity',
  CREATIVE_INSPO: '/creative/inspo',
  CREATIVE_BOARDS: '/creative/boards',
  CREATIVE_RESEARCH: '/creative/research',

  // Customer Retention — new
  REPEAT_PURCHASES: '/customers/repeat-purchases',

  // Accounts & Offers
  ACCOUNTS_OFFERS: '/settings/accounts-offers',

  // Settings — new
  TEAM: '/settings/team',
  BRAND_VAULT: '/settings/brand-vault',
  SCHEDULED_REPORTS: '/settings/scheduled-reports',
  GDPR: '/settings/gdpr',

  // Data — new
  DATA_DICTIONARY: '/data/dictionary',

  // Onboarding
  ONBOARDING: '/onboarding',

  // Workspaces
  WORKSPACES: '/workspaces',

  // AI / Exceed
  AI_AGENTS: '/ai/agents',
  AI_REPORTS: '/ai/reports',
  AI_CREATIVE: '/ai/creative',
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
      { label: 'Bundles', path: ROUTES.BUNDLE_ANALYSIS, icon: Package },
      { label: 'Product Journey', path: ROUTES.PRODUCT_JOURNEY, icon: ShoppingCart },
      { label: 'Products', path: ROUTES.PRODUCT_ANALYSIS, icon: BarChart2 },
    ],
  },
  {
    label: 'Creative',
    icon: PenTool,
    children: [
      { label: 'Analytics', path: ROUTES.CREATIVE_ANALYTICS, icon: BarChart3 },
      { label: 'Diversity', path: ROUTES.CREATIVE_DIVERSITY, icon: PieChart },
      { label: 'Inspo', path: ROUTES.CREATIVE_INSPO, icon: Library },
      { label: 'Boards', path: ROUTES.CREATIVE_BOARDS, icon: LayoutList },
      { label: 'Research', path: ROUTES.CREATIVE_RESEARCH, icon: Radar },
      { label: 'Generator', path: ROUTES.AI_CREATIVE, icon: Sparkles },
    ],
  },
  {
    label: 'Customer Retention',
    icon: Users,
    children: [
      { label: 'Segments', path: ROUTES.CUSTOMER_SEGMENTS, icon: Bookmark },
      { label: 'Cohorts', path: ROUTES.COHORT_ANALYSIS, icon: Calendar },
      { label: 'LTV Analysis', path: ROUTES.LTV_ANALYSIS, icon: DollarSign },
      { label: 'Repeat Purchases', path: ROUTES.REPEAT_PURCHASES, icon: Repeat },
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
      { label: 'Dictionary', path: ROUTES.DATA_DICTIONARY, icon: BookOpen },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { label: 'Accounts & Offers', path: ROUTES.ACCOUNTS_OFFERS, icon: Building2 },
      { label: 'Connections', path: ROUTES.CONNECTIONS, icon: Plug },
      { label: 'Overrides', path: ROUTES.OVERRIDES, icon: Edit3 },
      { label: 'General', path: ROUTES.GENERAL_SETTINGS, icon: Sliders },
      { label: 'Costs', path: ROUTES.COST_SETTINGS, icon: CreditCard },
      { label: 'Notifications', path: ROUTES.NOTIFICATIONS, icon: Bell },
      { label: 'Tracking', path: ROUTES.TRACKING, icon: MapPin },
      { label: 'Memories', path: ROUTES.MEMORIES, icon: Brain },
      { label: 'Widget', path: ROUTES.WIDGET, icon: LayoutGrid },
      { label: 'Team', path: ROUTES.TEAM, icon: UserPlus },
      { label: 'Brand Vault', path: ROUTES.BRAND_VAULT, icon: Palette },
      { label: 'Scheduled Reports', path: ROUTES.SCHEDULED_REPORTS, icon: Clock },
      { label: 'GDPR / Privacy', path: ROUTES.GDPR, icon: Shield },
    ],
  },
  {
    label: 'Rules',
    icon: Zap,
    path: ROUTES.RULES,
  },
  {
    label: 'Workspaces',
    icon: Layers,
    path: ROUTES.WORKSPACES,
  },
  {
    label: 'AI Studio',
    icon: Sparkles,
    children: [
      { label: 'Agents', path: ROUTES.AI_AGENTS, icon: Bot },
      { label: 'Reports', path: ROUTES.AI_REPORTS, icon: FileText },
    ],
  },
];
