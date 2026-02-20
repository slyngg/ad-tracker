import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Workspace { id: number; name: string; description: string; icon: string; color: string; created_at: string; }

export default function WorkspacesListPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => { setLoading(true); try { setWorkspaces(await apiFetch('/workspaces')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const ws = await apiFetch<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
    setShowCreate(false); setName(''); setDesc(''); navigate(`/workspaces/${ws.id}`);
  };

  const remove = async (id: number, e: React.MouseEvent) => { e.stopPropagation(); await apiFetch(`/workspaces/${id}`, { method: 'DELETE' }); load(); };

  if (loading) return <PageShell title="Workspaces" subtitle="Custom dashboards"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Workspaces" subtitle="Custom dashboards & agents">
      {showCreate && <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6 space-y-3">
        <input placeholder="Workspace name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text" />
        <input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text" />
        <div className="flex gap-2"><button onClick={create} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Create</button><button onClick={() => setShowCreate(false)} className="px-4 py-2 text-ats-text-muted text-sm">Cancel</button></div>
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map(ws => (
          <div key={ws.id} onClick={() => navigate(`/workspaces/${ws.id}`)} className="bg-ats-card rounded-xl border border-ats-border p-5 cursor-pointer hover:border-ats-accent transition-colors group">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: ws.color }}>{ws.name[0]}</div><h3 className="text-sm font-bold text-ats-text group-hover:text-ats-accent">{ws.name}</h3></div>
            <p className="text-xs text-ats-text-muted mb-3">{ws.description || 'No description'}</p>
            <div className="flex justify-between items-center"><span className="text-xs text-ats-text-muted">{new Date(ws.created_at).toLocaleDateString()}</span><button onClick={(e) => remove(ws.id, e)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100">Delete</button></div>
          </div>
        ))}
        <div onClick={() => setShowCreate(true)} className="bg-ats-card rounded-xl border-2 border-dashed border-ats-border p-5 cursor-pointer hover:border-ats-accent transition-colors flex items-center justify-center min-h-[140px]">
          <div className="text-center"><div className="text-3xl text-ats-text-muted mb-2">+</div><div className="text-sm text-ats-text-muted">Create Workspace</div></div>
        </div>
      </div>
    </PageShell>
  );
}
