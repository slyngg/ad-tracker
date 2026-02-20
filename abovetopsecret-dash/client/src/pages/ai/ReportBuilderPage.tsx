import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Report { id: number; title: string; report_type: string; content: string; generated_by: string; created_at: string; }

export default function ReportBuilderPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [type, setType] = useState('performance');

  const load = useCallback(async () => { setLoading(true); try { setReports(await apiFetch('/reports/generated')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try { const r = await apiFetch<Report>('/reports/generate', { method: 'POST', body: JSON.stringify({ type }) }); setSelected(r); load(); } catch {}
    finally { setGenerating(false); }
  };

  const view = async (id: number) => { try { setSelected(await apiFetch(`/reports/generated/${id}`)); } catch {} };
  const remove = async (id: number) => { await apiFetch(`/reports/generated/${id}`, { method: 'DELETE' }); if (selected?.id === id) setSelected(null); load(); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Report Builder" subtitle="AI-generated reports"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Report Builder" subtitle="AI-generated analytics reports">
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Generate Report</h3>
        <div className="flex gap-3">
          <select value={type} onChange={e => setType(e.target.value)} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="performance">Performance Summary</option><option value="attribution">Attribution Analysis</option><option value="creative">Creative Report</option><option value="custom">Custom</option></select>
          <button onClick={generate} disabled={generating} className="px-6 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50">{generating ? 'Generating...' : 'Generate'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-ats-text mb-2">Generated Reports</h3>
          {reports.map(r => (
            <div key={r.id} onClick={() => view(r.id)} className={`bg-ats-card rounded-lg border p-3 cursor-pointer transition-colors ${selected?.id === r.id ? 'border-ats-accent' : 'border-ats-border hover:border-ats-accent/50'}`}>
              <div className="text-sm font-semibold text-ats-text truncate">{r.title}</div>
              <div className="flex justify-between mt-1"><span className="text-xs text-ats-text-muted">{new Date(r.created_at).toLocaleDateString()}</span><button onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="text-xs text-red-400">Delete</button></div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-sm text-ats-text-muted">No reports yet.</p>}
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <div className={`${cardCls} prose prose-invert prose-sm max-w-none`}>
              <ReactMarkdown>{selected.content}</ReactMarkdown>
            </div>
          ) : <div className={`${cardCls} text-center p-8`}><p className="text-sm text-ats-text-muted">Select a report or generate a new one.</p></div>}
        </div>
      </div>
    </PageShell>
  );
}
