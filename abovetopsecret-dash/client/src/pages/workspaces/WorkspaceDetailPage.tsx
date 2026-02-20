import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Widget { id: number; widget_type: string; title: string; config: any; position_x: number; position_y: number; width: number; height: number; }

const WIDGET_TYPES = [
  { id: 'metric_card', label: 'Metric Card', desc: 'Single metric with value' },
  { id: 'text_note', label: 'Text Note', desc: 'Markdown text block' },
  { id: 'custom_sql', label: 'SQL Query', desc: 'Custom SQL result table' },
];

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => { setLoading(true); try { setWidgets(await apiFetch(`/workspaces/${id}/widgets`)); } catch {} finally { setLoading(false); } }, [id]);
  useEffect(() => { load(); }, [load]);

  const addWidget = async (type: string) => {
    await apiFetch(`/workspaces/${id}/widgets`, { method: 'POST', body: JSON.stringify({ widget_type: type, title: type === 'text_note' ? 'Note' : 'New Widget', config: {} }) });
    setShowAdd(false); load();
  };

  const removeWidget = async (widgetId: number) => { await apiFetch(`/workspaces/${id}/widgets/${widgetId}`, { method: 'DELETE' }); load(); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Workspace" subtitle="Loading..."><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Workspace" subtitle="Custom dashboard" actions={
      <div className="flex gap-2">
        <button onClick={() => setEditing(!editing)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${editing ? 'bg-amber-600 text-white' : 'bg-ats-surface border border-ats-border text-ats-text'}`}>{editing ? 'Done Editing' : 'Edit'}</button>
        <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold">Add Widget</button>
        <button onClick={() => navigate('/workspaces')} className="px-3 py-1.5 bg-ats-surface border border-ats-border text-ats-text rounded-lg text-xs">Back</button>
      </div>
    }>
      {showAdd && <div className={`${cardCls} mb-6`}><h3 className="text-sm font-semibold text-ats-text mb-3">Add Widget</h3><div className="grid grid-cols-3 gap-3">
        {WIDGET_TYPES.map(wt => <button key={wt.id} onClick={() => addWidget(wt.id)} className="bg-ats-bg rounded-lg p-3 border border-ats-border hover:border-ats-accent text-left"><div className="text-sm font-semibold text-ats-text">{wt.label}</div><div className="text-xs text-ats-text-muted">{wt.desc}</div></button>)}
      </div></div>}

      {widgets.length === 0 ? <div className={`${cardCls} text-center p-12`}><div className="text-4xl mb-4">📊</div><p className="text-sm text-ats-text-muted">No widgets yet. Click "Add Widget" to start building.</p></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {widgets.map(w => (
            <div key={w.id} className={`${cardCls} relative`} style={{ gridColumn: `span ${Math.min(w.width, 4)}` }}>
              {editing && <button onClick={() => removeWidget(w.id)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">x</button>}
              <h4 className="text-sm font-semibold text-ats-text mb-2">{w.title}</h4>
              {w.widget_type === 'metric_card' && <div className="text-2xl font-bold text-ats-accent font-mono">--</div>}
              {w.widget_type === 'text_note' && <p className="text-sm text-ats-text-muted">Edit to add content...</p>}
              {w.widget_type === 'custom_sql' && <p className="text-sm text-ats-text-muted">Configure SQL query...</p>}
              <div className="text-[10px] text-ats-text-muted mt-2 capitalize">{w.widget_type.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
