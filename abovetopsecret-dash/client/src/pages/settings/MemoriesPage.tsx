import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { getAuthToken } from '../../stores/authStore';
import PageShell from '../../components/shared/PageShell';

interface Memory {
  id: number;
  category: string;
  content: string;
  confidence: number;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'bg-purple-900/50 text-purple-300 border-purple-700/50',
  business_context: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  workflow: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
  insight: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
};

function getConfidenceLabel(confidence: number): { text: string; cls: string } {
  if (confidence >= 0.7) return { text: 'High', cls: 'text-emerald-400' };
  if (confidence >= 0.4) return { text: 'Medium', cls: 'text-amber-400' };
  return { text: 'Low', cls: 'text-red-400' };
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMemories = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/operator/memories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load memories (${res.status})`);
      const data = await res.json();
      setMemories(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this memory? This cannot be undone.')) return;
    setDeletingId(id);
    setMessage(null);
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/operator/memories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setMessage({ type: 'success', text: 'Memory deleted' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingId(null);
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
    <PageShell title="Operator Memories" subtitle="Things your AI operator has learned about your business">
      {message && (
        <div
          className={`px-3 py-2 mb-4 rounded-md text-sm ${
            message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 mb-4 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      )}

      {memories.length === 0 ? (
        <div className="bg-ats-card border border-ats-border rounded-lg p-8 text-center">
          <p className="text-sm text-ats-text-muted mb-2">No memories yet.</p>
          <p className="text-xs text-ats-text-muted/60">
            Chat with the Operator to build context.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {memories.map((memory) => {
            const confidence = getConfidenceLabel(memory.confidence);
            const categoryStyle =
              CATEGORY_COLORS[memory.category] || 'bg-gray-800/50 text-gray-300 border-gray-700/50';

            return (
              <div
                key={memory.id}
                className="bg-ats-card border border-ats-border rounded-lg p-4 flex flex-col gap-3 hover:border-ats-accent/30 transition-colors"
              >
                {/* Header: Category badge + delete */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${categoryStyle}`}
                  >
                    {memory.category.replace(/_/g, ' ')}
                  </span>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    disabled={deletingId === memory.id}
                    className="text-ats-text-muted hover:text-ats-red transition-colors p-1 rounded hover:bg-red-900/20 disabled:opacity-40"
                    title="Delete memory"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Content */}
                <p className="text-sm text-ats-text leading-relaxed flex-1">{memory.content}</p>

                {/* Footer: Confidence + date */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-medium ${confidence.cls}`}>
                    {confidence.text} confidence
                  </span>
                  <span className="text-ats-text-muted">{timeAgo(memory.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
