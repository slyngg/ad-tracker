import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Summary { total_customers: number; repeat_customers: number; repeat_rate: number; avg_orders_per_customer: number; }

export default function RepeatPurchaseRatePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSummary(await apiFetch<Summary>('/repeat-purchases/summary')); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Repeat Purchase Rate" subtitle="Customer retention metrics"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Repeat Purchase Rate" subtitle="Customer retention metrics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Total Customers</div><div className="text-2xl font-bold text-ats-text font-mono">{Number(summary?.total_customers || 0).toLocaleString()}</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Repeat Customers</div><div className="text-2xl font-bold text-ats-accent font-mono">{Number(summary?.repeat_customers || 0).toLocaleString()}</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Repeat Rate</div><div className="text-2xl font-bold text-emerald-400 font-mono">{parseFloat(String(summary?.repeat_rate || 0)).toFixed(1)}%</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Avg Orders/Customer</div><div className="text-2xl font-bold text-ats-text font-mono">{parseFloat(String(summary?.avg_orders_per_customer || 0)).toFixed(1)}</div></div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Repeat Rate Visualization</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-ats-bg rounded-full h-10 overflow-hidden relative">
            <div className="h-full bg-ats-accent rounded-full transition-all duration-700 flex items-center justify-center" style={{ width: `${Math.min(parseFloat(String(summary?.repeat_rate || 0)), 100)}%` }}>
              <span className="text-sm font-bold text-white">{parseFloat(String(summary?.repeat_rate || 0)).toFixed(1)}% repeat</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-ats-text-muted mt-3">A healthy repeat purchase rate for e-commerce is typically 20-40%. Higher rates indicate strong customer loyalty.</p>
      </div>
    </PageShell>
  );
}
