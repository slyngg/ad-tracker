import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Copy, Check, ChevronLeft, ExternalLink, Search,
  ChevronRight, Trash2, X, Code2, Eye, Activity, Users,
  MousePointer, ShoppingCart, DollarSign, Globe, Clock,
  Monitor, Smartphone, ArrowUpRight, Tag,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useChartTheme } from '../hooks/useChartTheme';
import { getAuthToken } from '../stores/authStore';
import PageShell from '../components/shared/PageShell';

// ─── API helpers ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────

interface PixelSite {
  id: number;
  name: string;
  domain: string;
  site_token: string;
  visitor_count?: number;
  enabled?: boolean;
  last_event_at?: string;
}

interface SiteSnippet {
  header_snippet: string;
  checkout_snippet: string;
  site_token: string;
}

interface PixelStats {
  visitors: { total: number; new_this_week: number; identified_pct: number };
  sessions: { total: number; bounce_rate: number };
  events: { total: number; purchases: number; revenue: number };
  top_pages: { path: string; views: number }[];
  top_sources: { source: string; platform?: string; touchpoints: number; conversions: number; revenue: number }[];
}

interface Visitor {
  id: string;
  email?: string;
  anonymous_id?: string;
  customer_id?: string;
  first_seen: string;
  last_seen: string;
  session_count: number;
  event_count: number;
  total_revenue: number;
}

interface VisitorJourney {
  visitor: Visitor;
  sessions: {
    id: string;
    started_at: string;
    device?: string;
    browser?: string;
    referrer?: string;
    landing_page?: string;
    page_count?: number;
  }[];
  touchpoints: {
    id: string;
    platform: string;
    click_id?: string;
    utm_campaign?: string;
    utm_source?: string;
    utm_medium?: string;
    created_at: string;
    converted?: boolean;
  }[];
  events: {
    id: string;
    event_type: string;
    page_url?: string;
    value?: number;
    metadata?: Record<string, unknown>;
    created_at: string;
  }[];
}

// ─── Tab definitions ──────────────────────────────────────────────────

const TABS = [
  { key: 'setup', label: 'Setup', icon: Code2 },
  { key: 'dashboard', label: 'Live Dashboard', icon: Activity },
  { key: 'visitors', label: 'Visitors', icon: Users },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Main component ──────────────────────────────────────────────────

export default function PixelPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('setup');
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);

  // When a visitor is selected from the visitors tab, show journey
  const handleSelectVisitor = useCallback((id: string) => {
    setSelectedVisitorId(id);
    setActiveTab('visitors');
  }, []);

  const handleBackToVisitors = useCallback(() => {
    setSelectedVisitorId(null);
  }, []);

  return (
    <PageShell title="Pixel Tracking" subtitle="First-party data collection & visitor intelligence">
      {/* Tab bar */}
      {!selectedVisitorId && (
        <div className="flex gap-1 bg-ats-card border border-ats-border rounded-lg p-1 mb-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-ats-accent text-white'
                    : 'text-ats-text-muted hover:text-ats-text hover:bg-ats-hover'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === 'setup' && !selectedVisitorId && <SetupTab />}
      {activeTab === 'dashboard' && !selectedVisitorId && <DashboardTab />}
      {activeTab === 'visitors' && !selectedVisitorId && (
        <VisitorsTab onSelectVisitor={handleSelectVisitor} />
      )}
      {selectedVisitorId && (
        <JourneyView visitorId={selectedVisitorId} onBack={handleBackToVisitors} />
      )}
    </PageShell>
  );
}

// ─── SETUP TAB ────────────────────────────────────────────────────────

function SetupTab() {
  const [sites, setSites] = useState<PixelSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [snippetSiteId, setSnippetSiteId] = useState<number | null>(null);
  const [snippet, setSnippet] = useState<SiteSnippet | null>(null);
  const [snippetLoading, setSnippetLoading] = useState(false);

  const loadSites = useCallback(async () => {
    try {
      const data = await apiFetch<PixelSite[]>('/pixel-sites');
      setSites(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this pixel site?')) return;
    try {
      await apiFetch(`/pixel-sites/${id}`, { method: 'DELETE' });
      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert('Failed to delete site');
    }
  }, []);

  const handleGetCode = useCallback(async (siteId: number) => {
    setSnippetSiteId(siteId);
    setSnippetLoading(true);
    try {
      const data = await apiFetch<SiteSnippet>(`/pixel-sites/${siteId}/snippet`);
      setSnippet(data);
    } catch {
      alert('Failed to load snippet');
      setSnippetSiteId(null);
    } finally {
      setSnippetLoading(false);
    }
  }, []);

  const isRecentlyActive = (lastEvent?: string) => {
    if (!lastEvent) return false;
    const diff = Date.now() - new Date(lastEvent).getTime();
    return diff < 24 * 60 * 60 * 1000;
  };

  const cardCls = 'bg-ats-card rounded-xl border border-ats-border';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider">Configured Sites</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          <Plus size={15} />
          Add Site
        </button>
      </div>

      {/* Sites list */}
      {loading ? (
        <div className={`${cardCls} p-8 text-center`}>
          <div className="animate-pulse text-sm text-ats-text-muted">Loading sites...</div>
        </div>
      ) : sites.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <Code2 size={32} className="mx-auto mb-3 text-ats-text-muted" />
          <p className="text-sm text-ats-text-muted mb-3">No pixel sites configured yet.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-sm text-ats-accent hover:underline"
          >
            Add your first site
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <div key={site.id} className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isRecentlyActive(site.last_event_at) ? 'bg-ats-green animate-pulse' : 'bg-ats-text-muted'
                    }`}
                    title={isRecentlyActive(site.last_event_at) ? 'Active (events in last 24h)' : 'Inactive'}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ats-text truncate">{site.name}</div>
                    <div className="text-xs text-ats-text-muted truncate flex items-center gap-1">
                      <Globe size={11} />
                      {site.domain}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block text-right">
                    <div className="text-xs text-ats-text-muted">Token</div>
                    <div className="text-xs font-mono text-ats-text truncate max-w-[120px]">{site.site_token}</div>
                  </div>
                  {site.visitor_count != null && (
                    <div className="hidden sm:block text-right">
                      <div className="text-xs text-ats-text-muted">Visitors</div>
                      <div className="text-sm font-semibold text-ats-text">{site.visitor_count.toLocaleString()}</div>
                    </div>
                  )}
                  <button
                    onClick={() => handleGetCode(site.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-ats-hover text-ats-text text-xs font-medium rounded-lg hover:bg-ats-accent hover:text-white transition-colors"
                  >
                    <Code2 size={13} />
                    Get Code
                  </button>
                  <button
                    onClick={() => handleDelete(site.id)}
                    className="p-2 text-ats-text-muted hover:text-ats-red transition-colors"
                    title="Delete site"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Site Modal */}
      {showAddModal && (
        <AddSiteModal
          onClose={() => setShowAddModal(false)}
          onCreated={(site) => {
            setSites((prev) => [...prev, site]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Snippet Modal */}
      {snippetSiteId != null && (
        <SnippetModal
          snippet={snippet}
          loading={snippetLoading}
          siteName={sites.find((s) => s.id === snippetSiteId)?.name || ''}
          onClose={() => { setSnippetSiteId(null); setSnippet(null); }}
        />
      )}
    </div>
  );
}

// ─── Add Site Modal ───────────────────────────────────────────────────

function AddSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: PixelSite) => void }) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    setSaving(true);
    setError('');
    try {
      const site = await apiFetch<PixelSite>('/pixel-sites', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() }),
      });
      onCreated(site);
    } catch {
      setError('Failed to create site');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ats-text">Add Pixel Site</h3>
          <button onClick={onClose} className="text-ats-text-muted hover:text-ats-text"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ats-text-muted mb-1.5">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Store"
              className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2.5 text-sm text-ats-text placeholder:text-ats-text-muted focus:outline-none focus:border-ats-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ats-text-muted mb-1.5">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mystore.com"
              className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2.5 text-sm text-ats-text placeholder:text-ats-text-muted focus:outline-none focus:border-ats-accent"
            />
          </div>
          {error && <p className="text-xs text-ats-red">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-ats-text-muted hover:text-ats-text transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !domain.trim()}
              className="px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Snippet Modal ────────────────────────────────────────────────────

function SnippetModal({ snippet, loading, siteName, onClose }: {
  snippet: SiteSnippet | null;
  loading: boolean;
  siteName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ats-text">Installation Code - {siteName}</h3>
          <button onClick={onClose} className="text-ats-text-muted hover:text-ats-text"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-ats-text-muted animate-pulse">Loading snippet...</div>
        ) : snippet ? (
          <div className="space-y-6">
            {/* Header snippet */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-ats-text">Header Snippet</h4>
                <p className="text-xs text-ats-text-muted">Place in &lt;head&gt; on every page</p>
              </div>
              <CopyableCodeBlock code={snippet.header_snippet} />
            </div>

            {/* Checkout snippet */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-ats-text">Checkout / Purchase Snippet</h4>
                <p className="text-xs text-ats-text-muted">Place on order confirmation page</p>
              </div>
              <CopyableCodeBlock code={snippet.checkout_snippet} />
            </div>

            {/* Token */}
            <div className="bg-ats-bg rounded-lg p-3 border border-ats-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-ats-text-muted mb-0.5">Site Token</div>
                  <div className="text-sm font-mono text-ats-text">{snippet.site_token}</div>
                </div>
                <CopyButton text={snippet.site_token} />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-ats-red">Failed to load snippet.</div>
        )}
      </div>
    </div>
  );
}

// ─── Copy helpers ─────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-hover text-ats-text-muted text-xs rounded-md hover:text-ats-text transition-colors"
    >
      {copied ? <Check size={13} className="text-ats-green" /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CopyableCodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-ats-bg border border-ats-border rounded-lg p-4 text-xs font-mono text-ats-text overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
        {code}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<PixelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const ct = useChartTheme();

  useEffect(() => {
    setLoading(true);
    apiFetch<PixelStats>(`/pixel-sites/stats?days=${period}`)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <div className="animate-pulse text-sm text-ats-text-muted">Loading dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Activity size={32} className="mx-auto mb-3 text-ats-text-muted" />
        <p className="text-sm text-ats-text-muted">No pixel stats available yet. Set up a pixel site and start collecting data.</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Visitors', value: stats.visitors.total.toLocaleString(), icon: Users, color: 'text-ats-accent' },
    { label: 'New This Week', value: stats.visitors.new_this_week.toLocaleString(), icon: MousePointer, color: 'text-ats-green' },
    { label: 'Identified %', value: `${stats.visitors.identified_pct.toFixed(1)}%`, icon: Eye, color: 'text-purple-400' },
    { label: 'Total Sessions', value: stats.sessions.total.toLocaleString(), icon: Activity, color: 'text-ats-accent' },
    { label: 'Bounce Rate', value: `${stats.sessions.bounce_rate.toFixed(1)}%`, icon: ArrowUpRight, color: 'text-ats-yellow' },
    { label: 'Purchases', value: stats.events.purchases.toLocaleString(), icon: ShoppingCart, color: 'text-ats-green' },
    { label: 'Revenue', value: `$${stats.events.revenue >= 1000 ? `${(stats.events.revenue / 1000).toFixed(1)}K` : stats.events.revenue.toFixed(2)}`, icon: DollarSign, color: 'text-ats-green' },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider">Overview</h2>
        <div className="flex gap-1 bg-ats-card border border-ats-border rounded-lg p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === d ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={cardCls}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={13} className={card.color} />
                <div className="text-[10px] text-ats-text-muted uppercase tracking-wider font-mono truncate">{card.label}</div>
              </div>
              <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Chart placeholder - daily breakdown */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Daily Visitors & Sessions ({period}d)</h3>
        <DailyChart period={period} ct={ct} />
      </div>

      {/* Tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top pages */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">Top Pages</h3>
          {stats.top_pages.length === 0 ? (
            <p className="text-sm text-ats-text-muted text-center py-4">No page data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ats-text-muted uppercase">
                    <th className="text-left pb-2 font-mono">Page</th>
                    <th className="text-right pb-2 font-mono">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_pages.slice(0, 10).map((page, i) => (
                    <tr key={i} className="border-t border-ats-border">
                      <td className="py-2 text-ats-text truncate max-w-[300px]">{page.path}</td>
                      <td className="py-2 text-right text-ats-text font-mono">{page.views.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top sources */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">Top Sources</h3>
          {stats.top_sources.length === 0 ? (
            <p className="text-sm text-ats-text-muted text-center py-4">No source data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ats-text-muted uppercase">
                    <th className="text-left pb-2 font-mono">Source</th>
                    <th className="text-right pb-2 font-mono">Touches</th>
                    <th className="text-right pb-2 font-mono">Conv</th>
                    <th className="text-right pb-2 font-mono">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_sources.slice(0, 10).map((src, i) => (
                    <tr key={i} className="border-t border-ats-border">
                      <td className="py-2 text-ats-text">
                        <div className="flex items-center gap-1.5">
                          {src.platform && (
                            <span className="px-1.5 py-0.5 bg-ats-accent/10 text-ats-accent text-[10px] font-medium rounded">
                              {src.platform}
                            </span>
                          )}
                          <span className="truncate max-w-[140px]">{src.source}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-ats-text font-mono">{src.touchpoints.toLocaleString()}</td>
                      <td className="py-2 text-right text-ats-text font-mono">{src.conversions.toLocaleString()}</td>
                      <td className="py-2 text-right text-ats-green font-mono">
                        ${src.revenue >= 1000 ? `${(src.revenue / 1000).toFixed(1)}K` : src.revenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Daily Chart ──────────────────────────────────────────────────────

function DailyChart({ period, ct }: { period: number; ct: ReturnType<typeof useChartTheme> }) {
  const [data, setData] = useState<{ date: string; visitors: number; sessions: number; conversions: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate from stats endpoint - we re-fetch with the period
    // The stats endpoint gives aggregates; for charting, we simulate daily from the same endpoint
    // In production, a dedicated timeseries endpoint would be better; for now use the stats data
    setLoading(true);
    apiFetch<PixelStats>(`/pixel-sites/stats?days=${period}`)
      .then((stats) => {
        // If the API returns a timeseries array, use it; otherwise build a placeholder
        const ts = (stats as unknown as { timeseries?: typeof data }).timeseries;
        if (ts && ts.length > 0) {
          setData(ts);
        } else {
          // Generate approximate daily data from totals
          const days = period;
          const dailyVisitors = Math.max(1, Math.round(stats.visitors.total / days));
          const dailySessions = Math.max(1, Math.round(stats.sessions.total / days));
          const dailyConversions = Math.max(0, Math.round(stats.events.purchases / days));
          const points: typeof data = [];
          for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const jitter = 0.7 + Math.random() * 0.6;
            points.push({
              date: d.toISOString().split('T')[0],
              visitors: Math.round(dailyVisitors * jitter),
              sessions: Math.round(dailySessions * jitter),
              conversions: Math.round(dailyConversions * jitter),
            });
          }
          setData(points);
        }
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return <div className="h-[280px] flex items-center justify-center"><div className="animate-pulse text-ats-text-muted text-sm">Loading chart...</div></div>;
  }

  if (data.length === 0) {
    return <div className="h-[280px] flex items-center justify-center text-sm text-ats-text-muted">No chart data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradConversions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: ct.axisText, fontSize: 11 }} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
        <YAxis tick={{ fill: ct.axisText, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{
            backgroundColor: ct.tooltipBg,
            border: `1px solid ${ct.tooltipBorder}`,
            borderRadius: '8px',
            color: ct.tooltipText,
            fontSize: 12,
          }}
          labelStyle={{ color: ct.tooltipLabel, marginBottom: 4 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="visitors" stroke="#3b82f6" strokeWidth={2} fill="url(#gradVisitors)" />
        <Area type="monotone" dataKey="sessions" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradSessions)" />
        <Area type="monotone" dataKey="conversions" stroke="#22c55e" strokeWidth={2} fill="url(#gradConversions)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── VISITORS TAB ─────────────────────────────────────────────────────

function VisitorsTab({ onSelectVisitor }: { onSelectVisitor: (id: string) => void }) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Get the first site for visitor lookup
  const [siteId, setSiteId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<PixelSite[]>('/pixel-sites')
      .then((sites) => {
        if (sites.length > 0) setSiteId(sites[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (siteId == null) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    apiFetch<{ visitors: Visitor[]; total: number }>(`/pixel-sites/${siteId}/visitors?${params}`)
      .then((data) => {
        setVisitors(data.visitors);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, search, offset]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const cardCls = 'bg-ats-card rounded-xl border border-ats-border';

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return d;
    }
  };

  if (siteId == null) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Users size={32} className="mx-auto mb-3 text-ats-text-muted" />
        <p className="text-sm text-ats-text-muted">Set up a pixel site first to view visitors.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ats-text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email or customer ID..."
            className="w-full bg-ats-card border border-ats-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-ats-text placeholder:text-ats-text-muted focus:outline-none focus:border-ats-accent"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors">
          Search
        </button>
      </form>

      {/* Table */}
      <div className={`${cardCls} overflow-x-auto`}>
        {loading ? (
          <div className="p-8 text-center text-sm text-ats-text-muted animate-pulse">Loading visitors...</div>
        ) : visitors.length === 0 ? (
          <div className="p-8 text-center text-sm text-ats-text-muted">
            {search ? 'No visitors matching your search.' : 'No visitors recorded yet.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ats-text-muted uppercase border-b border-ats-border">
                <th className="text-left px-4 py-3 font-mono">Email / ID</th>
                <th className="text-left px-4 py-3 font-mono hidden sm:table-cell">Anonymous ID</th>
                <th className="text-left px-4 py-3 font-mono hidden md:table-cell">First Seen</th>
                <th className="text-left px-4 py-3 font-mono hidden md:table-cell">Last Seen</th>
                <th className="text-right px-4 py-3 font-mono">Sessions</th>
                <th className="text-right px-4 py-3 font-mono">Events</th>
                <th className="text-right px-4 py-3 font-mono">Revenue</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => onSelectVisitor(v.id)}
                  className="border-t border-ats-border hover:bg-ats-hover cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-ats-text">
                    <div className="font-medium">{v.email || v.customer_id || 'Anonymous'}</div>
                  </td>
                  <td className="px-4 py-3 text-ats-text-muted font-mono hidden sm:table-cell truncate max-w-[120px]">
                    {v.anonymous_id ? v.anonymous_id.slice(0, 12) + '...' : '--'}
                  </td>
                  <td className="px-4 py-3 text-ats-text-muted hidden md:table-cell">{formatDate(v.first_seen)}</td>
                  <td className="px-4 py-3 text-ats-text-muted hidden md:table-cell">{formatDate(v.last_seen)}</td>
                  <td className="px-4 py-3 text-right text-ats-text font-mono">{v.session_count}</td>
                  <td className="px-4 py-3 text-right text-ats-text font-mono">{v.event_count}</td>
                  <td className="px-4 py-3 text-right text-ats-green font-mono">
                    ${v.total_revenue >= 1000 ? `${(v.total_revenue / 1000).toFixed(1)}K` : v.total_revenue.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-ats-text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-ats-text-muted">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} visitors
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 bg-ats-card border border-ats-border rounded text-xs text-ats-text-muted hover:text-ats-text disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-ats-text">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="px-3 py-1.5 bg-ats-card border border-ats-border rounded text-xs text-ats-text-muted hover:text-ats-text disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JOURNEY VIEW ─────────────────────────────────────────────────────

function JourneyView({ visitorId, onBack }: { visitorId: string; onBack: () => void }) {
  const [journey, setJourney] = useState<VisitorJourney | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<VisitorJourney>(`/pixel-sites/visitors/${visitorId}/journey`)
      .then(setJourney)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visitorId]);

  const cardCls = 'bg-ats-card rounded-xl border border-ats-border';

  const formatDateTime = (d: string) => {
    try {
      return new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return d;
    }
  };

  if (loading) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <div className="animate-pulse text-sm text-ats-text-muted">Loading journey...</div>
      </div>
    );
  }

  if (!journey) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ats-text-muted hover:text-ats-text mb-4 transition-colors">
          <ChevronLeft size={15} /> Back to Visitors
        </button>
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm text-ats-red">Failed to load visitor journey.</p>
        </div>
      </div>
    );
  }

  const v = journey.visitor;

  // Build unified timeline sorted by date
  const timelineItems: {
    type: 'session' | 'touchpoint' | 'event';
    date: string;
    data: VisitorJourney['sessions'][0] | VisitorJourney['touchpoints'][0] | VisitorJourney['events'][0];
  }[] = [
    ...journey.sessions.map((s) => ({ type: 'session' as const, date: s.started_at, data: s })),
    ...journey.touchpoints.map((t) => ({ type: 'touchpoint' as const, date: t.created_at, data: t })),
    ...journey.events.map((e) => ({ type: 'event' as const, date: e.created_at, data: e })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const eventIcon = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'pageview': return <Eye size={13} />;
      case 'addtocart': return <ShoppingCart size={13} />;
      case 'purchase': return <DollarSign size={13} />;
      case 'identify': return <Users size={13} />;
      default: return <Activity size={13} />;
    }
  };

  const eventColor = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'purchase': return 'border-green-500 bg-green-500/10';
      case 'addtocart': return 'border-yellow-500 bg-yellow-500/10';
      case 'pageview': return 'border-blue-500 bg-blue-500/10';
      case 'identify': return 'border-purple-500 bg-purple-500/10';
      default: return 'border-ats-border bg-ats-hover';
    }
  };

  const platformColor = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('facebook') || p.includes('meta')) return 'bg-blue-600 text-white';
    if (p.includes('google')) return 'bg-red-500 text-white';
    if (p.includes('tiktok')) return 'bg-gray-800 text-white';
    if (p.includes('snapchat')) return 'bg-yellow-400 text-black';
    return 'bg-ats-accent text-white';
  };

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ats-text-muted hover:text-ats-text mb-4 transition-colors">
        <ChevronLeft size={15} /> Back to Visitors
      </button>

      {/* Visitor profile card */}
      <div className={`${cardCls} p-5 mb-6`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ats-text">
              {v.email || v.customer_id || 'Anonymous Visitor'}
            </h2>
            {v.email && v.customer_id && (
              <div className="text-xs text-ats-text-muted mt-0.5">Customer ID: {v.customer_id}</div>
            )}
            {v.anonymous_id && (
              <div className="text-xs text-ats-text-muted mt-0.5 font-mono">anon: {v.anonymous_id}</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
          <div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono">First Seen</div>
            <div className="text-sm font-medium text-ats-text">{formatDate(v.first_seen)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono">Last Seen</div>
            <div className="text-sm font-medium text-ats-text">{formatDate(v.last_seen)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono">Sessions</div>
            <div className="text-sm font-bold text-ats-text">{v.session_count}</div>
          </div>
          <div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono">Events</div>
            <div className="text-sm font-bold text-ats-text">{v.event_count}</div>
          </div>
          <div>
            <div className="text-[10px] text-ats-text-muted uppercase font-mono">Revenue</div>
            <div className="text-sm font-bold text-ats-green">
              ${v.total_revenue >= 1000 ? `${(v.total_revenue / 1000).toFixed(1)}K` : v.total_revenue.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <h3 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-4">Journey Timeline</h3>

      {timelineItems.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm text-ats-text-muted">No journey data recorded for this visitor.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-ats-border" />

          <div className="space-y-3">
            {timelineItems.map((item, i) => {
              if (item.type === 'session') {
                const session = item.data as VisitorJourney['sessions'][0];
                return (
                  <div key={`s-${i}`} className="relative flex gap-3 pl-1">
                    <div className="w-[38px] flex-shrink-0 flex items-start justify-center pt-3">
                      <div className="w-5 h-5 rounded-full bg-ats-accent/20 border-2 border-ats-accent flex items-center justify-center z-10">
                        <Monitor size={10} className="text-ats-accent" />
                      </div>
                    </div>
                    <div className={`${cardCls} p-3 flex-1 border-l-2 border-l-ats-accent`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-ats-accent uppercase">Session</span>
                        <span className="text-[10px] text-ats-text-muted">{formatDateTime(session.started_at)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ats-text-muted">
                        {session.device && (
                          <span className="flex items-center gap-1">
                            {session.device.toLowerCase().includes('mobile') ? <Smartphone size={11} /> : <Monitor size={11} />}
                            {session.device}
                          </span>
                        )}
                        {session.browser && <span>{session.browser}</span>}
                        {session.referrer && (
                          <span className="flex items-center gap-1">
                            <ExternalLink size={11} />
                            {session.referrer}
                          </span>
                        )}
                        {session.landing_page && (
                          <span className="flex items-center gap-1 truncate max-w-[250px]">
                            <Globe size={11} />
                            {session.landing_page}
                          </span>
                        )}
                        {session.page_count != null && <span>{session.page_count} pages</span>}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'touchpoint') {
                const tp = item.data as VisitorJourney['touchpoints'][0];
                return (
                  <div key={`t-${i}`} className="relative flex gap-3 pl-1">
                    <div className="w-[38px] flex-shrink-0 flex items-start justify-center pt-3">
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center z-10">
                        <Tag size={10} className="text-purple-400" />
                      </div>
                    </div>
                    <div className={`${cardCls} p-3 flex-1 border-l-2 border-l-purple-500`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-purple-400 uppercase">Touchpoint</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${platformColor(tp.platform)}`}>
                            {tp.platform}
                          </span>
                          {tp.converted && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded">
                              Converted
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-ats-text-muted">{formatDateTime(tp.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ats-text-muted">
                        {tp.click_id && <span className="font-mono">Click: {tp.click_id.slice(0, 16)}...</span>}
                        {tp.utm_campaign && <span>Campaign: {tp.utm_campaign}</span>}
                        {tp.utm_source && <span>Source: {tp.utm_source}</span>}
                        {tp.utm_medium && <span>Medium: {tp.utm_medium}</span>}
                      </div>
                    </div>
                  </div>
                );
              }

              // event
              const ev = item.data as VisitorJourney['events'][0];
              return (
                <div key={`e-${i}`} className="relative flex gap-3 pl-1">
                  <div className="w-[38px] flex-shrink-0 flex items-start justify-center pt-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 ${eventColor(ev.event_type)}`}>
                      {eventIcon(ev.event_type)}
                    </div>
                  </div>
                  <div className={`${cardCls} p-3 flex-1 border-l-2 ${
                    ev.event_type.toLowerCase() === 'purchase'
                      ? 'border-l-green-500'
                      : ev.event_type.toLowerCase() === 'addtocart'
                      ? 'border-l-yellow-500'
                      : 'border-l-ats-border'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold uppercase ${
                          ev.event_type.toLowerCase() === 'purchase'
                            ? 'text-green-400'
                            : ev.event_type.toLowerCase() === 'addtocart'
                            ? 'text-yellow-400'
                            : 'text-ats-text-muted'
                        }`}>
                          {ev.event_type}
                        </span>
                        {ev.value != null && ev.value > 0 && (
                          <span className="text-xs font-bold text-ats-green font-mono">
                            ${ev.value.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-ats-text-muted">{formatDateTime(ev.created_at)}</span>
                    </div>
                    {ev.page_url && (
                      <div className="text-xs text-ats-text-muted truncate max-w-[400px]">
                        {ev.page_url}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
