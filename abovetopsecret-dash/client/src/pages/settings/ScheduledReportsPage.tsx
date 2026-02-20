import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Report { id: number; name: string; report_type: string; schedule: string; delivery_channel: string; delivery_config: any; enabled: boolean; last_sent_at: string | null; created_at: string; }

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', report_type: 'daily_summary', schedule: '0 8 * * *', delivery_channel: 'email', email: '' });

  const load = useCallback(async () => { setLoading(true); try { setReports(await apiFetch('/reports')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    await apiFetch('/reports', { method: 'POST', body: JSON.stringify({ ...form, delivery_config: { email: form.email } }) });
    setShowCreate(false); load();
  };

  const toggle = async (id: number) => { await apiFetch(`/reports/${id}/toggle`, { method: 'POST' }); load(); };
  const remove = async (id: number) => { await apiFetch(`/reports/${id}`, { method: 'DELETE' }); load(); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Scheduled Reports" subtitle="Automated report delivery"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Scheduled Reports" subtitle="Automated report delivery" actions={<button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold">Create Report</button>}>
      {showCreate && <div className={`${cardCls} mb-4 space-y-3`}>
        <input placeholder="Report name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.report_type} onChange={e => setForm({ ...form, report_type: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="daily_summary">Daily Summary</option><option value="weekly_summary">Weekly Summary</option><option value="custom">Custom</option></select>
          <select value={form.delivery_channel} onChange={e => setForm({ ...form, delivery_channel: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="email">Email</option><option value="slack">Slack</option></select>
        </div>
        <input placeholder="Delivery email or Slack channel" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
        <button onClick={create} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Create</button>
      </div>}
      {reports.length === 0 ? <div className={`${cardCls} text-center p-8`}><p className="text-sm text-ats-text-muted">No scheduled reports yet. Create one to receive automated analytics.</p></div> : (
        <div className={`${cardCls} overflow-hidden`}><table className="w-full"><thead><tr className="border-b border-ats-border">{['Name', 'Type', 'Schedule', 'Channel', 'Last Sent', 'Enabled', 'Actions'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
          {reports.map(r => <tr key={r.id} className="border-b border-ats-border last:border-0"><td className="px-3 py-2 text-sm text-ats-text font-semibold">{r.name}</td><td className="px-3 py-2 text-sm text-ats-text-muted">{r.report_type}</td><td className="px-3 py-2 text-sm font-mono text-ats-text-muted">{r.schedule}</td><td className="px-3 py-2 text-sm text-ats-text-muted capitalize">{r.delivery_channel}</td><td className="px-3 py-2 text-sm text-ats-text-muted">{r.last_sent_at ? new Date(r.last_sent_at).toLocaleDateString() : 'Never'}</td><td className="px-3 py-2"><button onClick={() => toggle(r.id)} className={`text-xs px-2 py-0.5 rounded-full ${r.enabled ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-700/50 text-gray-300'}`}>{r.enabled ? 'On' : 'Off'}</button></td><td className="px-3 py-2"><button onClick={() => remove(r.id)} className="text-xs text-red-400">Delete</button></td></tr>)}
        </tbody></table></div>
      )}
    </PageShell>
  );
}
