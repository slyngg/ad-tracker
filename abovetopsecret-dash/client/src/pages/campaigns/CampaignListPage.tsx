import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCampaignDrafts,
  deleteCampaignDraft,
  publishCampaignDraft,
  createCampaignDraft,
  CampaignDraft,
  PublishResult,
} from '../../lib/api';
import { Plus, Pencil, Copy, Trash2, Send, Loader2, Megaphone, Filter } from 'lucide-react';
import PageShell from '../../components/shared/PageShell';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  validating: 'bg-blue-500/20 text-blue-400',
  publishing: 'bg-yellow-500/20 text-yellow-400',
  published: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  archived: 'bg-gray-500/20 text-gray-500',
};

const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  meta: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Meta' },
  tiktok: { bg: 'bg-pink-500/15', text: 'text-pink-400', label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
};

export default function CampaignListPage() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCampaignDrafts();
      setDrafts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign drafts');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this campaign draft? This cannot be undone.')) return;
    setActionLoading((prev) => ({ ...prev, [id]: 'deleting' }));
    try {
      await deleteCampaignDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete draft');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function handlePublish(id: number) {
    setActionLoading((prev) => ({ ...prev, [id]: 'publishing' }));
    try {
      const result: PublishResult = await publishCampaignDraft(id);
      if (result.success) {
        setDrafts((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: 'published' as const } : d)),
        );
      } else {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: 'failed' as const, last_error: result.error || null } : d,
          ),
        );
        alert(result.error || 'Publish failed. Check campaign for errors.');
      }
    } catch (err: any) {
      alert(err.message || 'Publish failed');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function handleDuplicate(draft: CampaignDraft) {
    if (!draft.account_id) {
      alert('Cannot duplicate: campaign has no account assigned.');
      return;
    }
    setActionLoading((prev) => ({ ...prev, [draft.id]: 'duplicating' }));
    try {
      const newDraft = await createCampaignDraft({
        account_id: draft.account_id,
        name: `${draft.name} (Copy)`,
        objective: draft.objective || undefined,
        special_ad_categories: draft.special_ad_categories || undefined,
        platform: draft.platform || 'meta',
      });
      setDrafts((prev) => [newDraft, ...prev]);
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        return next;
      });
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Loading state
  if (loading) {
    return (
      <PageShell title="Campaign Manager" showDatePicker subtitle="Build and manage ad campaigns">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />
          ))}
        </div>
      </PageShell>
    );
  }

  // Error state
  if (error) {
    return (
      <PageShell title="Campaign Manager" showDatePicker subtitle="Build and manage ad campaigns">
        <div className="px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Campaign Manager"
      showDatePicker
      subtitle="Build and manage ad campaigns"
      actions={
        <button
          onClick={() => navigate('/campaigns/builder')}
          className="flex items-center gap-1.5 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      }
    >
      {/* Empty state */}
      {drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="w-12 h-12 text-ats-text-muted mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-ats-text mb-1">No campaigns yet</h3>
          <p className="text-sm text-ats-text-muted mb-6 max-w-sm">
            Create your first campaign draft to start building ads.
          </p>
          <button
            onClick={() => navigate('/campaigns/builder')}
            className="flex items-center gap-1.5 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      ) : (
        <>
          {/* Platform filter */}
          <div className="flex items-center gap-2 mb-4">
            {['all', 'meta', 'tiktok'].map((p) => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  platformFilter === p
                    ? 'bg-ats-accent/20 border-ats-accent text-ats-accent'
                    : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                }`}
              >
                {p === 'all' ? 'All Platforms' : p === 'meta' ? 'Meta' : 'TikTok'}
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-ats-card border border-ats-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ats-border">
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Platform
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Account
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Objective
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Created
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.filter((d) => platformFilter === 'all' || (d.platform || 'meta') === platformFilter).map((draft) => {
                  const busy = actionLoading[draft.id];
                  return (
                    <tr
                      key={draft.id}
                      className="border-b border-ats-border/50 last:border-b-0 hover:bg-ats-hover/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-ats-text">{draft.name}</span>
                        {draft.last_error && (
                          <p className="text-[11px] text-ats-red mt-0.5 truncate max-w-[240px]" title={draft.last_error}>
                            {draft.last_error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const p = PLATFORM_BADGE[draft.platform || 'meta'] || PLATFORM_BADGE.meta;
                          return (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.bg} ${p.text}`}>
                              {p.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-ats-text-muted">
                        {draft.account_name || (draft.account_id ? `#${draft.account_id}` : '--')}
                      </td>
                      <td className="px-4 py-3 text-ats-text-muted capitalize">
                        {draft.objective?.replace(/_/g, ' ') || '--'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${STATUS_BADGE[draft.status] || STATUS_BADGE.draft}`}
                        >
                          {draft.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ats-text-muted text-xs">
                        {formatDate(draft.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {busy ? (
                            <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" />
                          ) : (
                            <>
                              <button
                                onClick={() => navigate(`/campaigns/builder?draft=${draft.id}`)}
                                className="p-1.5 rounded-md hover:bg-ats-hover text-ats-text-muted hover:text-ats-text transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDuplicate(draft)}
                                className="p-1.5 rounded-md hover:bg-ats-hover text-ats-text-muted hover:text-ats-text transition-colors"
                                title="Duplicate"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {(draft.status === 'draft' || draft.status === 'failed') && (
                                <button
                                  onClick={() => handlePublish(draft.id)}
                                  className="p-1.5 rounded-md hover:bg-emerald-500/20 text-ats-text-muted hover:text-emerald-400 transition-colors"
                                  title="Publish"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(draft.id)}
                                className="p-1.5 rounded-md hover:bg-red-500/20 text-ats-text-muted hover:text-ats-red transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {drafts.filter((d) => platformFilter === 'all' || (d.platform || 'meta') === platformFilter).map((draft) => {
              const busy = actionLoading[draft.id];
              return (
                <div
                  key={draft.id}
                  className="bg-ats-card border border-ats-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-ats-text text-sm truncate">{draft.name}</h3>
                      <p className="text-xs text-ats-text-muted mt-0.5">
                        {draft.account_name || (draft.account_id ? `#${draft.account_id}` : 'No account')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${STATUS_BADGE[draft.status] || STATUS_BADGE.draft}`}
                    >
                      {draft.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-ats-text-muted mb-3">
                    {(() => {
                      const p = PLATFORM_BADGE[draft.platform || 'meta'] || PLATFORM_BADGE.meta;
                      return (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.bg} ${p.text}`}>
                          {p.label}
                        </span>
                      );
                    })()}
                    <span className="capitalize">{draft.objective?.replace(/_/g, ' ') || 'No objective'}</span>
                    <span>{formatDate(draft.created_at)}</span>
                  </div>

                  {draft.last_error && (
                    <p className="text-[11px] text-ats-red mb-3 line-clamp-2">{draft.last_error}</p>
                  )}

                  <div className="flex items-center gap-1 border-t border-ats-border/50 pt-3">
                    {busy ? (
                      <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" />
                    ) : (
                      <>
                        <button
                          onClick={() => navigate(`/campaigns/builder?draft=${draft.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(draft)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors"
                        >
                          <Copy className="w-3 h-3" /> Duplicate
                        </button>
                        {(draft.status === 'draft' || draft.status === 'failed') && (
                          <button
                            onClick={() => handlePublish(draft.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Send className="w-3 h-3" /> Publish
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(draft.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-ats-text-muted hover:bg-red-500/20 hover:text-ats-red transition-colors ml-auto"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}
