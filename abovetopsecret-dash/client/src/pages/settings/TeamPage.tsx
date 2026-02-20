import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Member { id: number; email: string; display_name: string; role: string; invite_email: string; invite_accepted_at: string | null; created_at: string; }

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const load = useCallback(async () => { setLoading(true); try { setMembers(await apiFetch('/team')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    try { await apiFetch('/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) }); setEmail(''); setShowInvite(false); setMessage({ type: 'success', text: 'Invite sent!' }); load(); } catch { setMessage({ type: 'error', text: 'Failed to invite' }); }
  };

  const remove = async (id: number) => { await apiFetch(`/team/${id}`, { method: 'DELETE' }); load(); };

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const roleBadge = (r: string) => r === 'owner' ? 'bg-purple-900/50 text-purple-300' : r === 'admin' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-700/50 text-gray-300';

  if (loading) return <PageShell title="Team" subtitle="Manage team members"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Team" subtitle="Manage team members" actions={<button onClick={() => setShowInvite(!showInvite)} className="px-4 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold">Invite Member</button>}>
      {message && <div className={`px-3 py-2 mb-4 rounded-md text-sm ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>{message.text}</div>}
      {showInvite && <div className={`${cardCls} mb-4`}><div className="flex gap-3"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="team@example.com" className="flex-1 bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text" /><select value={role} onChange={e => setRole(e.target.value)} className="bg-ats-bg border border-ats-border rounded-md px-3 py-2 text-sm text-ats-text"><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button onClick={invite} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Send Invite</button></div></div>}
      <div className={`${cardCls} overflow-hidden`}><table className="w-full"><thead><tr className="border-b border-ats-border">{['Member', 'Role', 'Status', 'Joined', 'Actions'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
        {members.map(m => <tr key={m.id} className="border-b border-ats-border last:border-0"><td className="px-3 py-2"><div className="text-sm text-ats-text font-semibold">{m.display_name || m.invite_email}</div><div className="text-xs text-ats-text-muted">{m.email || m.invite_email}</div></td><td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${roleBadge(m.role)}`}>{m.role}</span></td><td className="px-3 py-2 text-sm text-ats-text-muted">{m.invite_accepted_at ? 'Active' : 'Pending'}</td><td className="px-3 py-2 text-sm text-ats-text-muted font-mono">{new Date(m.created_at).toLocaleDateString()}</td><td className="px-3 py-2">{m.role !== 'owner' && <button onClick={() => remove(m.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>}</td></tr>)}
      </tbody></table></div>
    </PageShell>
  );
}
