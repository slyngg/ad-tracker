import { Suspense, lazy, Component, ReactNode } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import AuthGate from './components/auth/AuthGate';
import LoadingSpinner from './components/shared/LoadingSpinner';
import AppLayout from './components/layout/AppLayout';
import { useAuthStore } from './stores/authStore';

const OnboardingWizard = lazy(() => import('./pages/onboarding/OnboardingWizard'));

// Lazy-loaded pages
const SummaryDashboard = lazy(() => import('./pages/SummaryDashboard'));
const OperatorPage = lazy(() => import('./pages/operator/OperatorPage'));
const AttributionDashboard = lazy(() => import('./pages/acquisition/AttributionDashboard'));
const SourceMediumPage = lazy(() => import('./pages/acquisition/SourceMediumPage'));
const WebsitePerformancePage = lazy(() => import('./pages/website/WebsitePerformancePage'));
const WebsiteFunnelPage = lazy(() => import('./pages/website/WebsiteFunnelPage'));
const SiteSearchPage = lazy(() => import('./pages/website/SiteSearchPage'));
const CustomerSegmentsPage = lazy(() => import('./pages/customers/CustomerSegmentsPage'));
const CohortAnalysisPage = lazy(() => import('./pages/customers/CohortAnalysisPage'));
const LTVAnalysisPage = lazy(() => import('./pages/customers/LTVAnalysisPage'));
const SocialMonitoringPage = lazy(() => import('./pages/discovery/SocialMonitoringPage'));
const AIVisibilityPage = lazy(() => import('./pages/discovery/AIVisibilityPage'));
const KeywordIntelligencePage = lazy(() => import('./pages/discovery/KeywordIntelligencePage'));
const SQLBuilderPage = lazy(() => import('./pages/data/SQLBuilderPage'));
const APIKeysPage = lazy(() => import('./pages/data/APIKeysPage'));
const DataUploadPage = lazy(() => import('./pages/data/DataUploadPage'));
const ConnectionsPage = lazy(() => import('./pages/settings/ConnectionsPage'));
const OverridesPage = lazy(() => import('./pages/settings/OverridesPage'));
const GeneralSettingsPage = lazy(() => import('./pages/settings/GeneralSettingsPage'));
const CostSettingsPage = lazy(() => import('./pages/settings/CostSettingsPage'));
const NotificationsPage = lazy(() => import('./pages/settings/NotificationsPage'));
const TrackingSettingsPage = lazy(() => import('./pages/settings/TrackingSettingsPage'));
const AccountPage = lazy(() => import('./pages/settings/AccountPage'));
const RulesEnginePage = lazy(() => import('./pages/rules/RulesEnginePage'));
const PnLPage = lazy(() => import('./pages/finance/PnLPage'));
const MemoriesPage = lazy(() => import('./pages/settings/MemoriesPage'));
const AccountsOffersPage = lazy(() => import('./pages/settings/AccountsOffersPage'));
const WidgetConfigPage = lazy(() => import('./pages/settings/WidgetConfigPage'));

// New pages — Website Conversion Depth
const BundleAnalysisPage = lazy(() => import('./pages/website/BundleAnalysisPage'));
const ProductJourneyPage = lazy(() => import('./pages/website/ProductJourneyPage'));
const ProductAnalysisPage = lazy(() => import('./pages/website/ProductAnalysisPage'));

// Creative Analysis
const CreativeAnalysisPage = lazy(() => import('./pages/creative/CreativeAnalysisPage'));
const CreativeAnalyticsPage = lazy(() => import('./pages/creative/CreativeAnalyticsPage'));
const CreativeDiversityPage = lazy(() => import('./pages/creative/CreativeDiversityPage'));
const CreativeInspoPage = lazy(() => import('./pages/creative/CreativeInspoPage'));
const CreativeBoardsPage = lazy(() => import('./pages/creative/CreativeBoardsPage'));
const CompetitorResearchPage = lazy(() => import('./pages/creative/CompetitorResearchPage'));

// Customer Retention additions
const RepeatPurchaseRatePage = lazy(() => import('./pages/customers/RepeatPurchaseRatePage'));

// Settings additions
const TeamPage = lazy(() => import('./pages/settings/TeamPage'));
const BrandVaultPage = lazy(() => import('./pages/settings/BrandVaultPage'));
const ScheduledReportsPage = lazy(() => import('./pages/settings/ScheduledReportsPage'));
const GDPRPage = lazy(() => import('./pages/settings/GDPRPage'));

// Data additions
const DataDictionaryPage = lazy(() => import('./pages/data/DataDictionaryPage'));

// Workspaces
const WorkspacesListPage = lazy(() => import('./pages/workspaces/WorkspacesListPage'));
const WorkspaceDetailPage = lazy(() => import('./pages/workspaces/WorkspaceDetailPage'));

// AI / Exceed
const AgentBuilderPage = lazy(() => import('./pages/ai/AgentBuilderPage'));
const AgentChatPage = lazy(() => import('./pages/ai/AgentChatPage'));
const ReportBuilderPage = lazy(() => import('./pages/ai/ReportBuilderPage'));
const CreativeGeneratorPage = lazy(() => import('./pages/ai/CreativeGeneratorPage'));

// Campaign Manager
const CampaignListPage = lazy(() => import('./pages/campaigns/CampaignListPage'));
const CampaignBuilderPage = lazy(() => import('./pages/campaigns/CampaignBuilderPage'));

// Creative Templates + Ad Library
const CreativeTemplatesPage = lazy(() => import('./pages/creative/CreativeTemplatesPage'));
const AdLibraryPage = lazy(() => import('./pages/creative/AdLibraryPage'));

// Error boundary
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-ats-bg min-h-screen flex items-center justify-center font-sans">
          <div className="bg-ats-card rounded-2xl p-8 w-full max-w-[400px] mx-4 border border-ats-border text-center">
            <div className="text-lg font-bold text-ats-red mb-2">Something went wrong</div>
            <div className="text-sm text-ats-text-muted mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-ats-accent rounded-lg text-white text-sm font-semibold cursor-pointer hover:bg-blue-600 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 404 page
function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-ats-card border border-ats-border rounded-2xl p-8 text-center max-w-md">
        <h2 className="text-lg font-bold text-ats-text mb-2">Page Not Found</h2>
        <p className="text-sm text-ats-text-muted mb-4">The page you're looking for doesn't exist.</p>
        <Link
          to="/"
          className="px-6 py-3 bg-ats-accent rounded-lg text-white text-sm font-semibold hover:bg-blue-600 transition-colors inline-block"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user);

  // Block dashboard until onboarding is complete
  if (user && !user.onboardingCompleted) {
    return <OnboardingWizard />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route element={<OnboardingGate><AppLayout /></OnboardingGate>}>
              <Route index element={<Navigate to="/summary" replace />} />
              <Route path="/summary" element={<SummaryDashboard />} />
              <Route path="/operator" element={<OperatorPage />} />

              {/* Marketing Acquisition */}
              <Route path="/acquisition/attribution" element={<AttributionDashboard />} />
              <Route path="/acquisition/source-medium" element={<SourceMediumPage />} />

              {/* Website Conversion */}
              <Route path="/website/performance" element={<WebsitePerformancePage />} />
              <Route path="/website/funnel" element={<WebsiteFunnelPage />} />
              <Route path="/website/search" element={<SiteSearchPage />} />

              {/* Customer Retention */}
              <Route path="/customers/segments" element={<CustomerSegmentsPage />} />
              <Route path="/customers/cohorts" element={<CohortAnalysisPage />} />
              <Route path="/customers/ltv" element={<LTVAnalysisPage />} />

              {/* Discovery */}
              <Route path="/discovery/social" element={<SocialMonitoringPage />} />
              <Route path="/discovery/ai-visibility" element={<AIVisibilityPage />} />
              <Route path="/discovery/keywords" element={<KeywordIntelligencePage />} />

              {/* Data */}
              <Route path="/data/sql-builder" element={<SQLBuilderPage />} />
              <Route path="/data/api-keys" element={<APIKeysPage />} />
              <Route path="/data/upload" element={<DataUploadPage />} />

              {/* Settings */}
              <Route path="/settings/connections" element={<ConnectionsPage />} />
              <Route path="/settings/overrides" element={<OverridesPage />} />
              <Route path="/settings/general" element={<GeneralSettingsPage />} />
              <Route path="/settings/costs" element={<CostSettingsPage />} />
              <Route path="/settings/notifications" element={<NotificationsPage />} />
              <Route path="/settings/tracking" element={<TrackingSettingsPage />} />
              <Route path="/settings/account" element={<AccountPage />} />
              <Route path="/settings/memories" element={<MemoriesPage />} />
              <Route path="/settings/accounts-offers" element={<AccountsOffersPage />} />
              <Route path="/settings/widget" element={<WidgetConfigPage />} />

              {/* Website Conversion — new sub-pages */}
              <Route path="/website/bundles" element={<BundleAnalysisPage />} />
              <Route path="/website/product-journey" element={<ProductJourneyPage />} />
              <Route path="/website/products" element={<ProductAnalysisPage />} />

              {/* Creative Analysis */}
              <Route path="/creative/analysis" element={<CreativeAnalysisPage />} />
              <Route path="/creative/analytics" element={<CreativeAnalyticsPage />} />
              <Route path="/creative/diversity" element={<CreativeDiversityPage />} />
              <Route path="/creative/inspo" element={<CreativeInspoPage />} />
              <Route path="/creative/boards" element={<CreativeBoardsPage />} />
              <Route path="/creative/research" element={<CompetitorResearchPage />} />

              {/* Customer Retention — new */}
              <Route path="/customers/repeat-purchases" element={<RepeatPurchaseRatePage />} />

              {/* Finance */}
              <Route path="/finance/pnl" element={<PnLPage />} />

              {/* Rules */}
              <Route path="/rules" element={<RulesEnginePage />} />

              {/* Settings — new */}
              <Route path="/settings/team" element={<TeamPage />} />
              <Route path="/settings/brand-vault" element={<BrandVaultPage />} />
              <Route path="/settings/scheduled-reports" element={<ScheduledReportsPage />} />
              <Route path="/settings/gdpr" element={<GDPRPage />} />

              {/* Data — new */}
              <Route path="/data/dictionary" element={<DataDictionaryPage />} />

              {/* Workspaces */}
              <Route path="/workspaces" element={<WorkspacesListPage />} />
              <Route path="/workspaces/:id" element={<WorkspaceDetailPage />} />

              {/* AI / Exceed */}
              <Route path="/ai/agents" element={<AgentBuilderPage />} />
              <Route path="/ai/agents/:agentId/chat" element={<AgentChatPage />} />
              <Route path="/ai/reports" element={<ReportBuilderPage />} />
              <Route path="/ai/creative" element={<CreativeGeneratorPage />} />

              {/* Campaign Manager */}
              <Route path="/campaigns" element={<CampaignListPage />} />
              <Route path="/campaigns/builder" element={<CampaignBuilderPage />} />

              {/* Creative Templates + Ad Library */}
              <Route path="/creative/templates" element={<CreativeTemplatesPage />} />
              <Route path="/creative/ad-library" element={<AdLibraryPage />} />

              {/* 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthGate>
    </ErrorBoundary>
  );
}
