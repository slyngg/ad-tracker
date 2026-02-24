import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Segment { id: number; segment_name: string; segment_label: string; customer_count: number; total_revenue: number; avg_order_value: number; color: string; is_preset: boolean; recency_min: number; recency_max: number; frequency_min: number; frequency_max: number; monetary_min: number; monetary_max: number; }
interface Customer { customer_email: string; customer_name: string; recency_days: number; frequency: number; monetary: number; rfm_score: string; }

export default function CustomerSegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ segment_name: '', segment_label: '', color: '#3b82f6', recency_min: '', recency_max: '', frequency_min: '', frequency_max: '', monetary_min: '', monetary_max: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setSegments(await apiFetch<Segment[]>('/rfm/segments')); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const loadCustomers = useCallback(async (segId: number) => {
    setSelected(segId);
    try { const data = await apiFetch<{ customers: Customer[] }>(`/rfm/customers?segment=${segId}&limit=50`); setCustomers(data.customers); } catch {}
  }, []);

  const compute = async () => {
    setComputing(true);
    try { await apiFetch<any>('/rfm/compute'); await load(); } catch {}
    finally { setComputing(false); }
  };

  const createSegment = async () => {
    try {
      await fetch('/api/rfm/segments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` }, body: JSON.stringify(form) });
      setShowCreate(false); await load();
    } catch {}
  };

  const pieData = segments.filter(s => s.customer_count > 0).map(s => ({ name: s.segment_name, value: s.customer_count, color: s.color }));
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Customer Segments" showDatePicker subtitle="RFM segmentation"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Customer Segments" showDatePicker subtitle="RFM segmentation" actions={
      <div className="flex gap-2">
        <button onClick={compute} disabled={computing} className="px-4 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold disabled:opacity-50">{computing ? 'Computing...' : 'Recompute RFM'}</button>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-ats-surface border border-ats-border text-ats-text rounded-lg text-xs font-semibold">Create Segment</button>
      </div>
    }>
      {/* Create Segment Modal */}
      {showCreate && (
        <div className={`${cardCls} mb-6`}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">Create Custom Segment</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <input placeholder="Name" value={form.segment_name} onChange={e => setForm({ ...form, segment_name: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Label" value={form.segment_label} onChange={e => setForm({ ...form, segment_label: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Recency min (days)" value={form.recency_min} onChange={e => setForm({ ...form, recency_min: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Recency max" value={form.recency_max} onChange={e => setForm({ ...form, recency_max: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Frequency min" value={form.frequency_min} onChange={e => setForm({ ...form, frequency_min: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Frequency max" value={form.frequency_max} onChange={e => setForm({ ...form, frequency_max: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Monetary min ($)" value={form.monetary_min} onChange={e => setForm({ ...form, monetary_min: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
            <input placeholder="Monetary max ($)" value={form.monetary_max} onChange={e => setForm({ ...form, monetary_max: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
          </div>
          <button onClick={createSegment} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Save Segment</button>
        </div>
      )}

      {/* Segment Donut + Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className={`${cardCls} flex items-center justify-center`}>
          {pieData.length > 0 ? (
            <div className="w-[140px] h-[140px] sm:w-[180px] sm:h-[180px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius="35%" outerRadius="70%" dataKey="value" stroke="none">{pieData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          ) : <div className="text-sm text-ats-text-muted">No segment data. Click "Recompute RFM".</div>}
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-3 gap-3">
          {segments.map(seg => (
            <div key={seg.id} onClick={() => loadCustomers(seg.id)} className={`rounded-xl p-3 border-2 cursor-pointer transition-colors ${selected === seg.id ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: seg.color + '20', borderColor: selected === seg.id ? seg.color : 'transparent' }}>
              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} /><span className="text-sm font-bold text-ats-text">{seg.segment_name}</span></div>
              <div className="text-xs text-ats-text-muted mb-2">{seg.segment_label}</div>
              <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                <div><span className="text-ats-text-muted">Customers: </span><span className="text-ats-text">{seg.customer_count}</span></div>
                <div><span className="text-ats-text-muted">Revenue: </span><span className="text-ats-text">${parseFloat(String(seg.total_revenue)).toFixed(0)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer List */}
      {selected && customers.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <h3 className="text-sm font-semibold text-ats-text mb-3">Customers in Segment</h3>
          <table className="w-full"><thead><tr className="border-b border-ats-border">{['Email', 'Name', 'Recency', 'Frequency', 'Monetary', 'RFM Score'].map(h => <th key={h} className="px-3 py-2 text-left text-xs sm:text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
            {customers.map((c, i) => <tr key={i} className="border-b border-ats-border last:border-0">
              <td className="px-3 py-2 text-sm text-ats-text">{c.customer_email}</td>
              <td className="px-3 py-2 text-sm text-ats-text-muted">{c.customer_name || '-'}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{c.recency_days}d ago</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{c.frequency} orders</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(c.monetary)).toFixed(2)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-accent">{c.rfm_score}</td>
            </tr>)}
          </tbody></table>
        </div>
      )}
    </PageShell>
  );
}
