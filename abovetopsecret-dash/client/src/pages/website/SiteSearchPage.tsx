import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useChartTheme } from '../../hooks/useChartTheme';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface SearchQuery { search_term: string; total_searches: number; total_exits: number; conversions: number; revenue: number; conversion_rate: number; }
interface DailySearch { date: string; searches: number; }

export default function SiteSearchPage() {
  const ct = useChartTheme();
  const [queries, setQueries] = useState<SearchQuery[]>([]);
  const [daily, setDaily] = useState<DailySearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ queries: SearchQuery[]; daily: DailySearch[] }>('/ga4/search?startDate=30');
      setQueries(data.queries); setDaily(data.daily); setHasData(data.queries.length > 0);
    } catch { setHasData(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const lowCvr = queries.filter(q => q.total_searches > 5 && parseFloat(String(q.conversion_rate)) < 0.02);

  if (loading) return <PageShell title="Site Search" subtitle="Search analytics"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;
  if (!hasData) return <PageShell title="Site Search" subtitle="Search analytics"><div className={`${cardCls} text-center p-8`}><h3 className="text-lg font-bold text-ats-text mb-2">No Search Data</h3><p className="text-sm text-ats-text-muted">Connect GA4 with site search tracking enabled.</p></div></PageShell>;

  return (
    <PageShell title="Site Search" subtitle="Search analytics">
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Daily Search Volume</h3>
        <div className="h-[160px] sm:h-[200px]"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={daily}><CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} /><XAxis dataKey="date" tick={{ fill: ct.axisText, fontSize: 11 }} /><YAxis tick={{ fill: ct.axisText, fontSize: 11 }} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 8, color: ct.tooltipText }} /><Line type="monotone" dataKey="searches" stroke="#3b82f6" strokeWidth={2} dot={false} /></LineChart>
        </ResponsiveContainer></div>
      </div>
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Top Search Queries</h3>
        <table className="w-full"><thead><tr className="border-b border-ats-border">{['Query', 'Searches', 'Exits', 'Conversions', 'CVR', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
          {queries.slice(0, 15).map((q, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
            <td className="px-3 py-2 text-sm text-ats-text font-semibold">{q.search_term}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(q.total_searches).toLocaleString()}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(q.total_exits)}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(q.conversions)}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(q.conversion_rate)) * 100).toFixed(2)}%</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(q.revenue)).toFixed(2)}</td>
          </tr>)}
        </tbody></table>
      </div>
      {lowCvr.length > 0 && <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4"><h3 className="text-sm font-semibold text-amber-400 mb-3">Opportunity Zone: High Volume, Low CVR</h3>{lowCvr.slice(0, 10).map((q, i) => <div key={i} className="flex justify-between text-sm mb-1"><span className="text-ats-text">"{q.search_term}"</span><span className="text-ats-text-muted font-mono">{Number(q.total_searches)} searches, {(parseFloat(String(q.conversion_rate))*100).toFixed(1)}% CVR</span></div>)}</div>}
    </PageShell>
  );
}
