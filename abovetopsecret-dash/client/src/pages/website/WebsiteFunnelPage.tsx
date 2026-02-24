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

interface FunnelRow { event_name: string; total_events: number; unique_users: number; }
interface DeviceRow { event_name: string; device_category: string; total_events: number; }

const FUNNEL_ORDER = ['page_view', 'add_to_cart', 'begin_checkout', 'purchase'];
const FUNNEL_LABELS: Record<string, string> = { page_view: 'Page View', add_to_cart: 'Add to Cart', begin_checkout: 'Begin Checkout', purchase: 'Purchase' };
const FUNNEL_COLORS: Record<string, string> = { page_view: '#3b82f6', add_to_cart: '#8b5cf6', begin_checkout: '#f59e0b', purchase: '#10b981' };

export default function WebsiteFunnelPage() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [byDevice, setByDevice] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ funnel: FunnelRow[]; byDevice: DeviceRow[] }>('/ga4/funnel?startDate=30');
      setFunnel(data.funnel);
      setByDevice(data.byDevice);
      setHasData(data.funnel.length > 0);
    } catch { setHasData(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const ordered = FUNNEL_ORDER.map(name => funnel.find(f => f.event_name === name) || { event_name: name, total_events: 0, unique_users: 0 });
  const maxEvents = Math.max(...ordered.map(f => f.total_events), 1);
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Website Funnel" showDatePicker subtitle="Conversion funnel analysis"><div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse" />)}</div></PageShell>;

  if (!hasData) return (
    <PageShell title="Website Funnel" showDatePicker subtitle="Conversion funnel analysis">
      <div className={`${cardCls} text-center p-8`}>
        <h3 className="text-lg font-bold text-ats-text mb-2">Connect GA4 for Funnel Data</h3>
        <p className="text-sm text-ats-text-muted">Real funnel events require GA4 integration.</p>
        <a href="/settings/connections" className="inline-block mt-4 px-6 py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold">Configure GA4</a>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Website Funnel" showDatePicker subtitle="Conversion funnel analysis">
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-4">Conversion Funnel (Last 30 Days)</h3>
        <div className="space-y-3">
          {ordered.map((step, i) => {
            const pct = maxEvents > 0 ? (step.total_events / maxEvents) * 100 : 0;
            const prev = i > 0 ? ordered[i - 1] : null;
            const dropoff = prev && prev.total_events > 0 ? ((prev.total_events - step.total_events) / prev.total_events * 100).toFixed(1) : null;
            return (
              <div key={step.event_name}>
                {dropoff && <div className="text-right text-xs text-ats-text-muted mb-1">{dropoff}% drop-off</div>}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm text-ats-text font-semibold">{FUNNEL_LABELS[step.event_name]}</div>
                  <div className="flex-1 bg-ats-bg rounded-full h-8 overflow-hidden">
                    <div className="h-full rounded-full flex items-center px-3 transition-all duration-500" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: FUNNEL_COLORS[step.event_name] }}>
                      <span className="text-xs font-mono text-white font-bold">{step.total_events.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs font-mono text-ats-text-muted">{step.unique_users.toLocaleString()} users</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Funnel by Device</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border">
            {['Step', 'Desktop', 'Mobile', 'Tablet'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {FUNNEL_ORDER.map(event => {
              const dd = byDevice.filter(d => d.event_name === event);
              const get = (cat: string) => dd.find(d => d.device_category === cat)?.total_events || 0;
              return <tr key={event} className="border-b border-ats-border last:border-0">
                <td className="px-3 py-2 text-sm text-ats-text font-semibold">{FUNNEL_LABELS[event]}</td>
                <td className="px-3 py-2 text-sm font-mono text-ats-text">{get('desktop').toLocaleString()}</td>
                <td className="px-3 py-2 text-sm font-mono text-ats-text">{get('mobile').toLocaleString()}</td>
                <td className="px-3 py-2 text-sm font-mono text-ats-text">{get('tablet').toLocaleString()}</td>
              </tr>;
            })}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
