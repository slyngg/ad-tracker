import { useState, useEffect, useCallback, useMemo } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface RepeatRow { cohort_month: string; order_number: number; customer_count: number; total_revenue: number; }

export default function CohortAnalysisPage() {
  const [data, setData] = useState<RepeatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch<RepeatRow[]>('/repeat-purchases')); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const cohorts = useMemo(() => {
    const map = new Map<string, Map<number, RepeatRow>>();
    for (const row of data) {
      const month = row.cohort_month.slice(0, 7);
      if (!map.has(month)) map.set(month, new Map());
      map.get(month)!.set(row.order_number, row);
    }
    return map;
  }, [data]);

  const maxOrders = useMemo(() => Math.max(...data.map(d => d.order_number), 5), [data]);
  const months = [...cohorts.keys()].sort();
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  const getRetention = (month: string, orderNum: number) => {
    const cohort = cohorts.get(month);
    if (!cohort) return null;
    const first = cohort.get(1);
    const current = cohort.get(orderNum);
    if (!first || !current) return null;
    return { count: current.customer_count, rate: first.customer_count > 0 ? (current.customer_count / first.customer_count * 100) : 0 };
  };

  const heatColor = (rate: number) => {
    if (rate >= 50) return 'bg-emerald-800/60';
    if (rate >= 30) return 'bg-emerald-700/40';
    if (rate >= 15) return 'bg-emerald-600/20';
    if (rate >= 5) return 'bg-amber-700/20';
    return 'bg-red-800/20';
  };

  if (loading) return <PageShell title="Cohort Analysis" showDatePicker subtitle="Retention by cohort"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Cohort Analysis" showDatePicker subtitle="Retention heatmap" actions={
      <button onClick={async () => { await fetch('/api/repeat-purchases/compute', { method: 'POST', headers: { Authorization: `Bearer ${getAuthToken()}` } }); load(); }} className="px-4 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold">Recompute</button>
    }>
      {months.length === 0 ? (
        <div className={`${cardCls} text-center p-8`}>
          <h3 className="text-lg font-bold text-ats-text mb-2">No Cohort Data</h3>
          <p className="text-sm text-ats-text-muted">Click "Recompute" to generate cohort data from your orders.</p>
        </div>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full"><thead><tr className="border-b border-ats-border">
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Cohort</th>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Size</th>
            {Array.from({ length: Math.min(maxOrders, 8) }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Order {i + 1}</th>
            ))}
          </tr></thead><tbody>
            {months.map(month => {
              const firstOrder = cohorts.get(month)?.get(1);
              return <tr key={month} className="border-b border-ats-border last:border-0">
                <td className="px-3 py-2 text-sm text-ats-text font-semibold">{month}</td>
                <td className="px-3 py-2 text-sm font-mono text-ats-text">{firstOrder?.customer_count || 0}</td>
                {Array.from({ length: Math.min(maxOrders, 8) }, (_, i) => {
                  const ret = getRetention(month, i + 1);
                  return <td key={i} className={`px-2 py-2 text-center text-xs font-mono ${ret ? heatColor(ret.rate) : ''}`}>
                    {ret ? <><div className="text-ats-text">{ret.count}</div><div className="text-ats-text-muted">{ret.rate.toFixed(0)}%</div></> : '-'}
                  </td>;
                })}
              </tr>;
            })}
          </tbody></table>
        </div>
      )}
    </PageShell>
  );
}
