import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
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

interface Overview { total_customers: number; avg_ltv: number; avg_frequency: number; avg_recency: number; }
interface Customer { customer_email: string; customer_name: string; monetary: number; frequency: number; recency_days: number; }

export default function LTVAnalysisPage() {
  const ct = useChartTheme();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, custs] = await Promise.all([
        apiFetch<Overview>('/rfm/overview'),
        apiFetch<{ customers: Customer[] }>('/rfm/customers?limit=100'),
      ]);
      setOverview(ov); setCustomers(custs.customers);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  // LTV distribution buckets
  const buckets = [
    { label: '$0-50', min: 0, max: 50 }, { label: '$50-100', min: 50, max: 100 },
    { label: '$100-250', min: 100, max: 250 }, { label: '$250-500', min: 250, max: 500 },
    { label: '$500-1K', min: 500, max: 1000 }, { label: '$1K+', min: 1000, max: Infinity },
  ];
  const distribution = buckets.map(b => ({
    label: b.label,
    count: customers.filter(c => parseFloat(String(c.monetary)) >= b.min && parseFloat(String(c.monetary)) < b.max).length,
  }));

  const sorted = [...customers].sort((a, b) => parseFloat(String(b.monetary)) - parseFloat(String(a.monetary)));
  const top10pct = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1)));
  const top10Avg = top10pct.length > 0 ? top10pct.reduce((s, c) => s + parseFloat(String(c.monetary)), 0) / top10pct.length : 0;

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="LTV Analysis" subtitle="Customer lifetime value"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="LTV Analysis" subtitle="Customer lifetime value">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className={cardCls}><div className="text-xs sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Total Customers</div><div className="text-2xl font-bold text-ats-text font-mono">{Number(overview?.total_customers || 0).toLocaleString()}</div></div>
        <div className={cardCls}><div className="text-xs sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Average LTV</div><div className="text-2xl font-bold text-ats-accent font-mono">${parseFloat(String(overview?.avg_ltv || 0)).toFixed(2)}</div></div>
        <div className={cardCls}><div className="text-xs sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Top 10% LTV</div><div className="text-2xl font-bold text-emerald-400 font-mono">${top10Avg.toFixed(2)}</div></div>
        <div className={cardCls}><div className="text-xs sm:text-[11px] text-ats-text-muted uppercase font-mono mb-1">Avg Frequency</div><div className="text-2xl font-bold text-ats-text font-mono">{parseFloat(String(overview?.avg_frequency || 0)).toFixed(1)}</div></div>
      </div>

      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">LTV Distribution</h3>
        <div className="h-[180px] sm:h-[250px]"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: ct.axisText, fontSize: 11 }} />
            <YAxis tick={{ fill: ct.axisText, fontSize: 11 }} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 8, color: ct.tooltipText }} />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Top Customers by LTV</h3>
        <table className="w-full"><thead><tr className="border-b border-ats-border">{['Email', 'Name', 'LTV', 'Orders', 'Recency'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
          {sorted.slice(0, 20).map((c, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
            <td className="px-3 py-2 text-sm text-ats-text">{c.customer_email}</td>
            <td className="px-3 py-2 text-sm text-ats-text-muted">{c.customer_name || '-'}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-accent font-bold">${parseFloat(String(c.monetary)).toFixed(2)}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{c.frequency}</td>
            <td className="px-3 py-2 text-sm font-mono text-ats-text">{c.recency_days}d ago</td>
          </tr>)}
        </tbody></table>
      </div>
    </PageShell>
  );
}
