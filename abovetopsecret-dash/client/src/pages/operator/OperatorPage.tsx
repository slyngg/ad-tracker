import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useVoiceOutput } from '../../hooks/useVoiceOutput';
import { useWakeWord } from '../../hooks/useWakeWord';

interface ChatMessage {
  id: number | string;
  role: string;
  content: string;
  created_at: string;
}

interface ToolStatus {
  tool: string;
  status: string;
  summary?: string;
}

const QUICK_PROMPTS = [
  { label: 'Analyze my ROAS', prompt: 'Analyze my ROAS across all campaigns and highlight any concerns.' },
  { label: 'Which campaigns to pause?', prompt: 'Which campaigns should I consider pausing based on current performance?' },
  { label: 'Summarize today', prompt: 'Give me a summary of today\'s campaign performance.' },
];

// Markdown component overrides for dark theme
const markdownComponents = {
  table: (props: any) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse" {...props} />
    </div>
  ),
  thead: (props: any) => <thead className="border-b border-ats-border" {...props} />,
  th: (props: any) => <th className="text-left py-1.5 px-2 text-ats-text-muted font-medium text-[11px] uppercase" {...props} />,
  td: (props: any) => <td className="py-1 px-2 border-b border-ats-border/30" {...props} />,
  code: ({ children, className, ...props }: any) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-ats-bg px-1.5 py-0.5 rounded text-[12px] font-mono text-ats-accent" {...props}>{children}</code>
    ) : (
      <code className="block bg-ats-bg p-3 rounded-lg text-[12px] font-mono overflow-x-auto my-2" {...props}>{children}</code>
    );
  },
  pre: (props: any) => <pre className="bg-ats-bg rounded-lg overflow-x-auto my-2" {...props} />,
  ul: (props: any) => <ul className="list-disc ml-4 my-1 space-y-0.5" {...props} />,
  ol: (props: any) => <ol className="list-decimal ml-4 my-1 space-y-0.5" {...props} />,
  li: (props: any) => <li className="text-sm" {...props} />,
  p: (props: any) => <p className="my-1.5" {...props} />,
  h1: (props: any) => <h1 className="text-base font-bold mt-3 mb-1" {...props} />,
  h2: (props: any) => <h2 className="text-sm font-bold mt-3 mb-1" {...props} />,
  h3: (props: any) => <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-ats-text" {...props} />,
  a: (props: any) => <a className="text-ats-accent underline" target="_blank" rel="noopener noreferrer" {...props} />,
};

export default function OperatorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [handsFreeAutoSpeak, setHandsFreeAutoSpeak] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendMessageRef = useRef<(text: string) => void>();

  // Wake word handler — auto-sends the command
  const handleWakeCommand = useCallback((command: string) => {
    sendMessageRef.current?.(command);
  }, []);

  // Wake word hook
  const {
    state: wakeState,
    active: handsFreeActive,
    activate: activateHandsFree,
    deactivate: deactivateHandsFree,
    resumeListening: resumeWakeListening,
    isSupported: wakeWordSupported,
  } = useWakeWord(handleWakeCommand);

  // Voice output with onEnd callback for hands-free loop
  const handleSpeechEnd = useCallback(() => {
    if (handsFreeActive) {
      resumeWakeListening();
    }
  }, [handsFreeActive, resumeWakeListening]);

  const { speak, stop: stopSpeaking, isSpeaking, isSupported: voiceOutputSupported } = useVoiceOutput({ onEnd: handleSpeechEnd });

  const handleVoiceResult = useCallback((text: string) => {
    setInput(text);
  }, []);

  const { isListening, startListening, stopListening, isSupported: voiceInputSupported } = useVoiceInput(handleVoiceResult);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, toolStatuses, scrollToBottom]);

  // Default sidebar open on desktop, closed on mobile
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setSidebarOpen(mql.matches);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

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

  // Auto-speak assistant response when hands-free mode is active and streaming ends
  useEffect(() => {
    if (handsFreeActive && !streaming && handsFreeAutoSpeak) {
      setHandsFreeAutoSpeak(false);
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        speak(lastMsg.content);
      } else {
        // No content to speak, resume listening
        resumeWakeListening();
      }
    }
  }, [streaming, handsFreeActive, handsFreeAutoSpeak, messages, speak, resumeWakeListening]);

  const selectConversation = async (id: number) => {
    try {
      const detail = await fetchConversation(id);
      setActiveConvo(detail);
      setMessages(detail.messages);
      setError(null);
      // Close sidebar on mobile after selecting
      if (window.innerWidth < 1024) setSidebarOpen(false);
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
      if (window.innerWidth < 1024) setSidebarOpen(false);
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

    // Flag auto-speak for hands-free mode
    if (handsFreeActive) {
      setHandsFreeAutoSpeak(true);
    }

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
    setToolStatuses([]);
    setSuggestions([]);

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
              } else if (parsed.type === 'tool_status') {
                setToolStatuses((prev) => {
                  const existing = prev.findIndex((t) => t.tool === parsed.tool);
                  const updated = { tool: parsed.tool, status: parsed.status, summary: parsed.summary };
                  if (existing >= 0) {
                    const copy = [...prev];
                    copy[existing] = updated;
                    return copy;
                  }
                  return [...prev, updated];
                });
              } else if (parsed.type === 'suggestions' && Array.isArray(parsed.suggestions)) {
                setSuggestions(parsed.suggestions);
              } else if (parsed.type === 'text' && parsed.text) {
                accumulated += parsed.text;
              } else if (parsed.type === 'error') {
                setError(parsed.error || 'Stream error');
              } else if (parsed.content) {
                accumulated += parsed.content;
              } else if (parsed.token) {
                accumulated += parsed.token;
              } else if (typeof parsed === 'string') {
                accumulated += parsed;
              }
            } catch {
              accumulated += data;
            }
            if (accumulated) {
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
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
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
      loadConversations();
      // Static fallback suggestions if backend didn't send any
      setSuggestions((prev) =>
        prev.length > 0
          ? prev
          : ['How can I improve ROAS?', 'Show me underperforming campaigns', 'What should I do next?']
      );
    }
  };

  // Keep ref current for wake word callback
  sendMessageRef.current = sendMessage;

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

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-ats-border flex items-center gap-2">
        <button
          onClick={handleNewConversation}
          className="flex-1 px-3 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          + New Chat
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-2 text-ats-text-muted hover:text-ats-text"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
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
  );

  return (
    <PageShell title="Operator AI" subtitle="Your AI-powered media buying assistant" hideHeaderOnMobile compactMobile>
      <div className="flex h-[calc(100dvh-3rem)] lg:h-[calc(100vh-180px)] bg-ats-card border-y border-ats-border lg:border lg:rounded-xl rounded-none overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — overlay on mobile, inline on desktop */}
        <div
          className={`
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            fixed inset-y-0 left-0 z-50 w-72 bg-ats-card border-r border-ats-border
            transition-transform duration-200 ease-in-out
            lg:static lg:translate-x-0 lg:z-auto lg:w-64 lg:shrink-0 lg:bg-ats-bg/50
            ${!sidebarOpen && 'lg:hidden'}
          `}
        >
          {sidebarContent}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-3 py-1.5 lg:px-4 lg:py-3 border-b border-ats-border flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-ats-text-muted hover:text-ats-text text-sm p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ats-text truncate">
                {activeConvo?.title || 'Operator AI'}
              </h3>
            </div>
            {/* Green dot only on mobile, full badge on sm+ */}
            <span className="w-2 h-2 bg-ats-green rounded-full animate-pulse sm:hidden shrink-0" />
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-ats-text-muted bg-ats-bg/50 px-2 py-1 rounded-full border border-ats-border shrink-0">
              <span className="w-1.5 h-1.5 bg-ats-green rounded-full animate-pulse" />
              <span>Operator has access to your live metrics</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">
                {error}
              </div>
            )}

            {messages.length === 0 && !activeConvo && (
              <div className="flex flex-col items-start lg:items-center lg:justify-center h-full px-4 pt-6 lg:pt-0 lg:text-center">
                <div className="text-3xl mb-3">&#x1f916;</div>
                <h3 className="text-lg font-bold text-ats-text mb-2">OpticData Operator</h3>
                <p className="text-sm text-ats-text-muted mb-6 max-w-sm">
                  I can analyze your campaigns, suggest optimizations, and take actions on your Meta Ads — all from this chat.
                </p>
                <div className="flex flex-col w-full gap-2 lg:flex-row lg:flex-wrap lg:justify-center lg:w-auto">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => sendMessage(qp.prompt)}
                      className="w-full lg:w-auto px-4 py-2.5 bg-ats-bg border border-ats-border rounded-full text-sm text-ats-text hover:bg-ats-hover hover:border-ats-text-muted/30 transition-colors text-center"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length === 0 && activeConvo && (
              <div className="flex flex-col items-start lg:items-center lg:justify-center h-full px-4 pt-6 lg:pt-0 lg:text-center">
                <p className="text-sm text-ats-text-muted mb-4">Start a conversation with Operator.</p>
                <div className="flex flex-col w-full gap-2 lg:flex-row lg:flex-wrap lg:justify-center lg:w-auto">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => sendMessage(qp.prompt)}
                      className="w-full lg:w-auto px-4 py-2.5 bg-ats-bg border border-ats-border rounded-full text-sm text-ats-text hover:bg-ats-hover transition-colors text-center"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={msg.id}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] lg:max-w-[75%] rounded-xl px-3 py-2.5 lg:px-4 lg:py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-ats-accent text-white'
                        : 'bg-ats-bg border border-ats-border text-ats-text'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                    {msg.role === 'assistant' && streaming && msg === messages[messages.length - 1] && !msg.content && (
                      <span className="inline-block w-2 h-4 bg-ats-text-muted animate-pulse" />
                    )}
                    {/* Voice read-aloud button for assistant messages */}
                    {msg.role === 'assistant' && msg.content && voiceOutputSupported && !streaming && (
                      <button
                        onClick={() => isSpeaking ? stopSpeaking() : speak(msg.content)}
                        className="mt-2 text-xs text-ats-text-muted hover:text-ats-text transition-colors"
                        title={isSpeaking ? 'Stop reading' : 'Read aloud'}
                      >
                        {isSpeaking ? '■ Stop' : '🔊 Read aloud'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Tool statuses: show between user message and assistant response */}
                {msg.role === 'user' && toolStatuses.length > 0 && idx === messages.length - 2 && (
                  <div className="flex flex-wrap gap-2 my-2 ml-1">
                    {toolStatuses.map((ts) => (
                      <div
                        key={ts.tool}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          ts.status === 'running'
                            ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300'
                            : ts.status === 'error'
                            ? 'bg-red-900/30 border-red-700/50 text-red-300'
                            : 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
                        }`}
                      >
                        {ts.status === 'running' ? (
                          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        ) : ts.status === 'error' ? (
                          <span>✗</span>
                        ) : (
                          <span>✓</span>
                        )}
                        <span>{ts.tool.replace(/_/g, ' ')}</span>
                        {ts.summary && ts.status !== 'running' && (
                          <span className="text-[10px] opacity-70">— {ts.summary}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Follow-up suggestions */}
            {!streaming && messages.length > 0 && suggestions.length > 0 && (
              <div className="flex flex-col w-full gap-2 lg:flex-row lg:flex-wrap lg:w-auto px-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="w-full lg:w-auto px-4 py-2.5 bg-ats-bg border border-ats-border rounded-full text-sm text-ats-text hover:bg-ats-hover hover:border-ats-text-muted/30 transition-colors text-center"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Hands-free status indicator */}
          {handsFreeActive && (
            <div className="px-3 py-1.5 bg-purple-900/30 border-t border-purple-700/50 flex items-center justify-center gap-2 text-xs text-purple-300">
              <span className={`w-2 h-2 rounded-full ${wakeState === 'listening' ? 'bg-purple-400 animate-pulse' : wakeState === 'captured' ? 'bg-green-400' : 'bg-gray-400'}`} />
              {wakeState === 'listening' && 'Listening for "Hey Optics"...'}
              {wakeState === 'captured' && 'Processing command...'}
              {isSpeaking && 'Speaking response...'}
              <span className="text-[10px] text-purple-400/70 hidden sm:inline">(requires foreground tab)</span>
            </div>
          )}

          {/* Input */}
          <div className="p-2.5 lg:p-4 border-t border-ats-border">
            <form onSubmit={handleSubmit} className="flex gap-1.5 lg:gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Operator anything..."
                rows={1}
                className="flex-1 px-3 py-2.5 lg:px-4 lg:py-3 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text outline-none focus:border-ats-accent resize-none font-sans min-w-0"
              />
              {/* Voice input button */}
              {voiceInputSupported && (
                <button
                  type="button"
                  onClick={handleMicToggle}
                  className={`px-2.5 py-2.5 lg:px-3 lg:py-3 rounded-lg text-sm font-semibold transition-all shrink-0 ${
                    isListening
                      ? 'bg-red-500 text-white ring-2 ring-red-400 ring-offset-1 ring-offset-ats-card animate-pulse'
                      : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:text-ats-text hover:border-ats-text-muted/50'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  🎤
                </button>
              )}
              {/* Hands-free toggle */}
              {wakeWordSupported && (
                <button
                  type="button"
                  onClick={() => handsFreeActive ? deactivateHandsFree() : activateHandsFree()}
                  className={`px-2.5 py-2.5 lg:px-3 lg:py-3 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                    handsFreeActive
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-1 ring-offset-ats-card'
                      : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:text-ats-text hover:border-ats-text-muted/50'
                  }`}
                  title={handsFreeActive ? 'Disable hands-free mode' : 'Enable hands-free "Hey Optics" mode'}
                >
                  <span className="hidden lg:inline">{handsFreeActive ? 'Hands-Free ON' : 'Hands-Free'}</span>
                  <span className="lg:hidden">HF</span>
                </button>
              )}
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="px-3 py-2.5 lg:px-5 lg:py-3 bg-ats-red text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors shrink-0"
                >
                  <span className="hidden lg:inline">Stop</span>
                  <span className="lg:hidden">■</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-3 py-2.5 lg:px-5 lg:py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40 shrink-0"
                >
                  <span className="hidden lg:inline">Send</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 lg:hidden" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
