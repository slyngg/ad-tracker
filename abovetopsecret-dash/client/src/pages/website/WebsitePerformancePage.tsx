import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import PageShell from '../../components/shared/PageShell';
import AnimatedNumber from '../../components/shared/AnimatedNumber';
import { fmt } from '../../lib/formatters';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const BASE = '/api';
async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface GA4Overview { total_sessions: number; total_users: number; total_new_users: number; total_pageviews: number; total_conversions: number; total_add_to_carts: number; total_revenue: number; avg_pages_per_session: number; avg_session_duration: number; avg_bounce_rate: number; conversion_rate: number; }
interface SessionRow { group_key: string; sessions: number; users: number; new_users: number; conversions: number; revenue: number; bounce_rate: number; add_to_carts: number; }
interface PageRow { page_path: string; page_title: string; sessions: number; pageviews: number; avg_time_on_page: number; conversions: number; conversion_rate: number; revenue: number; }

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

export default function WebsitePerformancePage() {
  const [overview, setOverview] = useState<GA4Overview | null>(null);
  const [daily, setDaily] = useState<SessionRow[]>([]);
  const [byDevice, setByDevice] = useState<SessionRow[]>([]);
  const [byCountry, setByCountry] = useState<SessionRow[]>([]);
  const [bySource, setBySource] = useState<SessionRow[]>([]);
  const [topPages, setTopPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasGA4, setHasGA4] = useState(true);
  const [period, setPeriod] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, d, dev, cty, src, pages] = await Promise.all([
        apiFetch<GA4Overview>('/ga4/overview'),
        apiFetch<SessionRow[]>(`/ga4/sessions?startDate=${period}&groupBy=date`),
        apiFetch<SessionRow[]>(`/ga4/sessions?startDate=${period}&groupBy=device_category`),
        apiFetch<SessionRow[]>(`/ga4/sessions?startDate=${period}&groupBy=country`),
        apiFetch<SessionRow[]>(`/ga4/sessions?startDate=${period}&groupBy=source`),
        apiFetch<PageRow[]>(`/ga4/pages?startDate=${period}`),
      ]);
      setOverview(ov);
      setDaily(d);
      setByDevice(dev);
      setByCountry(cty);
      setBySource(src);
      setTopPages(pages);
      setHasGA4(parseFloat(String(ov.total_sessions)) > 0);
    } catch {
      setHasGA4(false);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const newVsReturning = useMemo(() => {
    if (!overview) return [];
    const newU = parseFloat(String(overview.total_new_users)) || 0;
    const total = parseFloat(String(overview.total_users)) || 1;
    return [
      { name: 'New', value: newU },
      { name: 'Returning', value: Math.max(0, total - newU) },
    ];
  }, [overview]);

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const kpiLabel = 'text-xs sm:text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1';

  if (loading) return <PageShell title="Website Performance" subtitle="GA4 web analytics"><div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-ats-card rounded-xl animate-pulse" />)}</div></PageShell>;

  if (!hasGA4) return (
    <PageShell title="Website Performance" subtitle="GA4 web analytics">
      <div className="bg-ats-card rounded-xl border border-ats-border p-8 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h3 className="text-lg font-bold text-ats-text mb-2">Connect Google Analytics 4</h3>
        <p className="text-sm text-ats-text-muted mb-4">Add your GA4 credentials in Settings → Connections to unlock website analytics including sessions, pageviews, bounce rate, conversion funnels, and more.</p>
        <a href="/settings/connections" className="inline-block px-6 py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors">Configure GA4</a>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Website Performance" subtitle="GA4 web analytics" actions={
      <div className="flex gap-2">{['7', '14', '30', '90'].map(p => (
        <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-md text-xs font-mono ${period === p ? 'bg-ats-accent text-white' : 'bg-ats-border text-ats-text-muted hover:bg-ats-hover'}`}>{p}d</button>
      ))}</div>
    }>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Unique Visitors', value: overview?.total_users || 0, format: fmt.num },
          { label: 'Total Sessions', value: overview?.total_sessions || 0, format: fmt.num },
          { label: 'Add to Carts', value: overview?.total_add_to_carts || 0, format: fmt.num },
          { label: 'Conversions', value: overview?.total_conversions || 0, format: fmt.num },
          { label: 'Conversion Rate', value: parseFloat(String(overview?.conversion_rate || 0)) * 100, format: fmt.pctRaw },
        ].map(kpi => (
          <div key={kpi.label} className={cardCls}>
            <div className={kpiLabel}>{kpi.label}</div>
            <div className="text-2xl font-bold text-ats-text font-mono"><AnimatedNumber value={kpi.value} format={kpi.format} /></div>
          </div>
        ))}
      </div>

      {/* Traffic Chart */}
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Daily Traffic &amp; Conversions</h3>
        <div className="h-[200px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
              <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis dataKey="group_key" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#f9fafb', fontSize: 12 }} />
            <Area type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={2} fill="url(#gSessions)" name="Sessions" />
            <Area type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} fill="url(#gConv)" name="Conversions" />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>

      {/* Engagement + New vs Returning */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">User Engagement</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><div className={kpiLabel}>Pages/Session</div><div className="text-lg font-bold text-ats-text font-mono">{parseFloat(String(overview?.avg_pages_per_session || 0)).toFixed(1)}</div></div>
            <div><div className={kpiLabel}>Bounce Rate</div><div className="text-lg font-bold text-ats-text font-mono">{(parseFloat(String(overview?.avg_bounce_rate || 0)) * 100).toFixed(1)}%</div></div>
            <div><div className={kpiLabel}>Avg Duration</div><div className="text-lg font-bold text-ats-text font-mono">{Math.round(parseFloat(String(overview?.avg_session_duration || 0)))}s</div></div>
          </div>
        </div>
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">New vs Returning</h3>
          <div className="flex items-center gap-4">
            <div className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={newVsReturning} cx="50%" cy="50%" innerRadius="40%" outerRadius="90%" dataKey="value" stroke="none">
                    {newVsReturning.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {newVsReturning.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm text-ats-text">{item.name}: {item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Device Type Table */}
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3 px-1">Performance by Device</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Device', 'Sessions', 'Users', 'Bounce Rate', 'Conversions', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {byDevice.map((r, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-text font-semibold capitalize">{r.group_key || 'unknown'}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.sessions).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.users).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(r.bounce_rate)) * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.conversions)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.revenue)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>

      {/* Source/Medium Table */}
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3 px-1">Traffic by Source</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Source', 'Sessions', 'New Users', 'Conversions', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {bySource.slice(0, 20).map((r, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-text font-semibold">{r.group_key || 'direct'}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.sessions).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.new_users).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.conversions)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.revenue)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>

      {/* Country Table */}
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3 px-1">Top Countries</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Country', 'Sessions', 'Users', 'Conversions', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {byCountry.slice(0, 20).map((r, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-text font-semibold">{r.group_key}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.sessions).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.users).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.conversions)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.revenue)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>

      {/* Top Landing Pages */}
      <div className={`${cardCls} overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3 px-1">Top 50 Landing Pages</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Page', 'Sessions', 'Pageviews', 'Conversions', 'CVR', 'Avg Time', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {topPages.map((r, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-accent max-w-[250px] truncate" title={r.page_path}>{r.page_path}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.sessions).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.pageviews).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(r.conversions)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(r.conversion_rate)) * 100).toFixed(2)}%</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Math.round(parseFloat(String(r.avg_time_on_page)))}s</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(r.revenue)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
