import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Agent { id: number; name: string; description: string; color: string; model: string; }
interface Message { id: number; role: string; content: string; created_at: string; }
interface ConvoDetail { id: number; messages: Message[]; }

export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [conversations, setConversations] = useState<{ id: number; title: string; created_at: string }[]>([]);
  const [convo, setConvo] = useState<ConvoDetail | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        apiFetch<Agent>(`/agents/${agentId}`),
        apiFetch<{ id: number; title: string; created_at: string }[]>(`/agents/${agentId}/conversations`),
      ]);
      setAgent(a);
      setConversations(c);
    } catch {}
    finally { setLoading(false); }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [convo?.messages]);

  const openConvo = async (id: number) => {
    try { setConvo(await apiFetch(`/agents/${agentId}/conversations/${id}`)); } catch {}
  };

  const newConvo = async () => {
    try {
      const c = await apiFetch<{ id: number; title: string; created_at: string }>(`/agents/${agentId}/conversations`, { method: 'POST', body: JSON.stringify({ title: 'New chat' }) });
      setConversations(prev => [c, ...prev]);
      setConvo({ id: c.id, messages: [] });
    } catch {}
  };

  const send = async () => {
    if (!input.trim() || !convo) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    // Optimistic user message
    setConvo(prev => prev ? { ...prev, messages: [...prev.messages, { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }] } : prev);
    try {
      const reply = await apiFetch<{ message: Message }>(`/agents/${agentId}/conversations/${convo.id}/messages`, { method: 'POST', body: JSON.stringify({ content: text }) });
      setConvo(prev => prev ? { ...prev, messages: [...prev.messages, reply.message] } : prev);
    } catch { setConvo(prev => prev ? { ...prev, messages: [...prev.messages, { id: Date.now() + 1, role: 'assistant', content: 'Sorry, something went wrong.', created_at: new Date().toISOString() }] } : prev); }
    finally { setSending(false); }
  };

  if (loading) return <PageShell title="Agent Chat" subtitle="Loading..."><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title={agent?.name || 'Agent Chat'} subtitle={agent?.description || ''} actions={
      <button onClick={() => navigate('/ai/agents')} className="px-3 py-1.5 bg-ats-surface border border-ats-border text-ats-text rounded-lg text-xs">Back to Agents</button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-12rem)]">
        {/* Sidebar */}
        <div className="lg:col-span-1 bg-ats-card rounded-xl border border-ats-border p-3 overflow-y-auto">
          <button onClick={newConvo} className="w-full px-3 py-2 bg-ats-accent text-white rounded-lg text-xs font-semibold mb-3">New Chat</button>
          <div className="space-y-1">
            {conversations.map(c => (
              <div key={c.id} onClick={() => openConvo(c.id)} className={`p-2 rounded-lg cursor-pointer text-xs truncate ${convo?.id === c.id ? 'bg-ats-accent/20 text-ats-accent' : 'text-ats-text-muted hover:bg-ats-hover'}`}>
                {c.title}
              </div>
            ))}
            {conversations.length === 0 && <p className="text-xs text-ats-text-muted text-center py-4">No conversations yet</p>}
          </div>
        </div>

        {/* Chat area */}
        <div className="lg:col-span-3 bg-ats-card rounded-xl border border-ats-border flex flex-col">
          {convo ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {convo.messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-ats-accent text-white' : 'bg-ats-bg border border-ats-border text-ats-text'}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              <div className="border-t border-ats-border p-3 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Type a message..."
                  className="flex-1 bg-ats-bg border border-ats-border rounded-lg px-4 py-2 text-sm text-ats-text"
                  disabled={sending}
                />
                <button onClick={send} disabled={sending || !input.trim()} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-white text-xl" style={{ backgroundColor: agent?.color || '#8b5cf6' }}>🤖</div>
                <p className="text-sm text-ats-text-muted">Start a new conversation or select one from the sidebar.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
