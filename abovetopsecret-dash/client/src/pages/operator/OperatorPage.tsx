import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  deleteConversation,
  Conversation,
  ConversationDetail,
} from '../../lib/api';
import { getAuthToken } from '../../stores/authStore';
import PageShell from '../../components/shared/PageShell';

interface ChatMessage {
  id: number | string;
  role: string;
  content: string;
  created_at: string;
}

const QUICK_PROMPTS = [
  { label: 'Analyze my ROAS', prompt: 'Analyze my ROAS across all campaigns and highlight any concerns.' },
  { label: 'Which campaigns to pause?', prompt: 'Which campaigns should I consider pausing based on current performance?' },
  { label: 'Summarize today', prompt: 'Give me a summary of today\'s campaign performance.' },
];

export default function OperatorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadConversations = useCallback(async () => {
    try {
      const convos = await fetchConversations();
      setConversations(convos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const selectConversation = async (id: number) => {
    try {
      const detail = await fetchConversation(id);
      setActiveConvo(detail);
      setMessages(detail.messages);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNewConversation = async () => {
    try {
      const convo = await createConversation();
      setConversations((prev) => [convo, ...prev]);
      setActiveConvo({ ...convo, messages: [] });
      setMessages([]);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvo?.id === id) {
        setActiveConvo(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;

    let convoId = activeConvo?.id;

    // Auto-create conversation if none selected
    if (!convoId) {
      try {
        const convo = await createConversation(text.slice(0, 50));
        setConversations((prev) => [convo, ...prev]);
        setActiveConvo({ ...convo, messages: [] });
        convoId = convo.id;
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setError(null);

    const assistantMsg: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const token = getAuthToken();

      const res = await fetch('/api/operator/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ conversationId: convoId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API error ${res.status}: ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'done') {
                break;
              } else if (parsed.type === 'text' && parsed.text) {
                accumulated += parsed.text;
              } else if (parsed.content) {
                accumulated += parsed.content;
              } else if (parsed.token) {
                accumulated += parsed.token;
              } else if (typeof parsed === 'string') {
                accumulated += parsed;
              }
            } catch {
              // Plain text chunk
              accumulated += data;
            }
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: accumulated };
              }
              return updated;
            });
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        // Remove empty assistant message on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Refresh conversation list to update titles
      loadConversations();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  return (
    <PageShell title="Operator AI" subtitle="Your AI-powered media buying assistant">
      <div className="flex h-[calc(100vh-180px)] bg-ats-card border border-ats-border rounded-xl overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 border-r border-ats-border flex flex-col bg-ats-bg/50 shrink-0">
            <div className="p-3 border-b border-ats-border">
              <button
                onClick={handleNewConversation}
                className="w-full px-3 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
              >
                + New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.map((convo) => (
                <div
                  key={convo.id}
                  onClick={() => selectConversation(convo.id)}
                  className={`px-3 py-2.5 cursor-pointer text-sm border-b border-ats-border/50 flex items-center justify-between group hover:bg-ats-hover transition-colors ${
                    activeConvo?.id === convo.id ? 'bg-ats-hover text-ats-text' : 'text-ats-text-muted'
                  }`}
                >
                  <span className="truncate flex-1 mr-2">{convo.title || 'Untitled'}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(convo.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-ats-red hover:text-red-400 text-xs shrink-0 transition-opacity"
                    title="Delete"
                  >
                    x
                  </button>
                </div>
              ))}
              {conversations.length === 0 && (
                <div className="p-4 text-xs text-ats-text-muted text-center">
                  No conversations yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-ats-border flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-ats-text-muted hover:text-ats-text text-sm"
            >
              {sidebarOpen ? '<' : '>'}
            </button>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-ats-text">
                {activeConvo?.title || 'Operator AI'}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ats-text-muted bg-ats-bg/50 px-2.5 py-1 rounded-full border border-ats-border">
              <span className="w-1.5 h-1.5 bg-ats-green rounded-full animate-pulse" />
              Operator has access to your live metrics
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">
                {error}
              </div>
            )}

            {messages.length === 0 && !activeConvo && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-3xl mb-3">&#x1f916;</div>
                <h3 className="text-lg font-bold text-ats-text mb-2">OpticData Operator</h3>
                <p className="text-sm text-ats-text-muted mb-6 max-w-sm">
                  I can analyze your campaigns, suggest optimizations, and answer questions about your ad performance data.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => sendMessage(qp.prompt)}
                      className="px-3 py-2 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text hover:bg-ats-hover hover:border-ats-text-muted/30 transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length === 0 && activeConvo && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-ats-text-muted mb-4">Start a conversation with Operator.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => sendMessage(qp.prompt)}
                      className="px-3 py-2 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text hover:bg-ats-hover transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-ats-accent text-white'
                      : 'bg-ats-bg border border-ats-border text-ats-text'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && streaming && msg === messages[messages.length - 1] && !msg.content && (
                    <span className="inline-block w-2 h-4 bg-ats-text-muted animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-ats-border">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Operator anything about your campaigns..."
                rows={1}
                className="flex-1 px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text outline-none focus:border-ats-accent resize-none font-sans"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="px-5 py-3 bg-ats-red text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-5 py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
