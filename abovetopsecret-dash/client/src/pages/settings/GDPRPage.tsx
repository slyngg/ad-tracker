import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface DeletionReq { id: number; customer_email: string; status: string; requested_at: string; completed_at: string | null; }

export default function GDPRPage() {
  const [requests, setRequests] = useState<DeletionReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  const load = useCallback(async () => { setLoading(true); try { setRequests(await apiFetch('/gdpr/requests')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!email) return;
    await apiFetch('/gdpr/request', { method: 'POST', body: JSON.stringify({ email }) });
    setEmail(''); load();
  };

  const process = async (id: number) => { await apiFetch(`/gdpr/process/${id}`, { method: 'POST' }); load(); };
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const statusBadge = (s: string) => s === 'completed' ? 'bg-emerald-900/50 text-emerald-300' : s === 'processing' ? 'bg-amber-900/50 text-amber-300' : 'bg-gray-700/50 text-gray-300';

  if (loading) return <PageShell title="Customer Data Deletion" subtitle="GDPR compliance"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Customer Data Deletion" subtitle="GDPR compliance">
      <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-6">
        <p className="text-sm text-amber-300 font-semibold">Deleting customer data is permanent and irreversible. All order history and analytics data for the specified customer will be removed.</p>
      </div>
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-bold text-ats-text mb-3">Submit Deletion Request</h3>
        <div className="flex gap-3"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" className="flex-1 bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text" /><button onClick={submit} className="px-6 py-3 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-500">Submit Request</button></div>
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        <h3 className="text-sm font-bold text-ats-text mb-3">Deletion Requests</h3>
        <table className="w-full"><thead><tr className="border-b border-ats-border">{['Email', 'Status', 'Requested', 'Completed', 'Action'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
          {requests.map(r => <tr key={r.id} className="border-b border-ats-border last:border-0"><td className="px-3 py-2 text-sm text-ats-text">{r.customer_email}</td><td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>{r.status}</span></td><td className="px-3 py-2 text-sm text-ats-text-muted font-mono">{new Date(r.requested_at).toLocaleDateString()}</td><td className="px-3 py-2 text-sm text-ats-text-muted">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '-'}</td><td className="px-3 py-2">{r.status === 'pending' && <button onClick={() => process(r.id)} className="text-xs text-red-400 hover:text-red-300">Process Now</button>}</td></tr>)}
          {requests.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-sm text-ats-text-muted">No deletion requests</td></tr>}
        </tbody></table>
      </div>
    </PageShell>
  );
}
