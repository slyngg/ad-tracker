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

interface Agent { id: number; name: string; description: string; system_prompt: string; tools: string[]; model: string; temperature: number; is_active: boolean; icon: string; color: string; }

export default function AgentBuilderPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', system_prompt: '', tools: [] as string[], model: 'claude-sonnet-4-6', temperature: 0.7, color: '#8b5cf6' });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try { const [a, t] = await Promise.all([apiFetch<Agent[]>('/agents'), apiFetch<string[]>('/agents/available-tools')]); setAgents(a); setTools(t); } catch {}
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const agent = await apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify(form) });
    setShowCreate(false); load();
  };

  const toggleTool = (tool: string) => {
    const next = form.tools.includes(tool) ? form.tools.filter(t => t !== tool) : [...form.tools, tool];
    setForm({ ...form, tools: next });
  };

  const remove = async (id: number, e: React.MouseEvent) => { e.stopPropagation(); await apiFetch(`/agents/${id}`, { method: 'DELETE' }); load(); };

  if (loading) return <PageShell title="AI Agents" subtitle="Custom AI assistants"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="AI Agents" subtitle="Build custom AI assistants" actions={<button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold">Create Agent</button>}>
      {showCreate && <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Agent name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
          <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" />
        </div>
        <textarea rows={4} placeholder="System prompt (e.g. 'You are a ROAS optimization expert...')" value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} className="w-full bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text font-mono" />
        <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-2 block">Available Tools</label><div className="flex flex-wrap gap-2">{tools.map(t => <button key={t} onClick={() => toggleTool(t)} className={`px-2 py-1 rounded text-xs font-mono ${form.tools.includes(t) ? 'bg-ats-accent text-white' : 'bg-ats-bg border border-ats-border text-ats-text-muted'}`}>{t}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">Temperature</label><input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })} className="w-full" /><span className="text-xs text-ats-text-muted">{form.temperature}</span></div>
          <div><label className="text-xs text-ats-text-muted uppercase font-mono mb-1 block">Color</label><input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-8 h-8" /></div>
        </div>
        <button onClick={create} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Create Agent</button>
      </div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.id} onClick={() => navigate(`/ai/agents/${agent.id}/chat`)} className="bg-ats-card rounded-xl border border-ats-border p-5 cursor-pointer hover:border-ats-accent transition-colors group">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style={{ backgroundColor: agent.color }}>🤖</div><h3 className="text-sm font-bold text-ats-text">{agent.name}</h3></div>
            <p className="text-xs text-ats-text-muted mb-2">{agent.description || 'No description'}</p>
            <div className="flex flex-wrap gap-1 mb-2">{agent.tools.slice(0, 3).map(t => <span key={t} className="text-[10px] bg-ats-bg px-1.5 py-0.5 rounded text-ats-text-muted font-mono">{t}</span>)}{agent.tools.length > 3 && <span className="text-[10px] text-ats-text-muted">+{agent.tools.length - 3}</span>}</div>
            <div className="flex justify-between"><span className="text-[10px] text-ats-text-muted">{agent.model}</span><button onClick={(e) => remove(agent.id, e)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100">Delete</button></div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
