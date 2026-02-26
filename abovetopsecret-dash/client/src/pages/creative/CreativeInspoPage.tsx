import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import {
  fetchSavedCreatives, saveInspoCreative, deleteSavedCreative,
  fetchFollowedBrands, followBrand, unfollowBrand,
  SavedCreative, FollowedBrand,
} from '../../lib/api';

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

function SaveModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ brand_name: '', platform: 'meta', ad_copy: '', headline: '', thumbnail_url: '', notes: '' });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'var(--overlay-bg)' }} onClick={onClose}>
      <div className={`${cardCls} w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Save Creative</h3>
        <div className="space-y-2">
          {['brand_name', 'headline', 'thumbnail_url'].map(f => (
            <input key={f} placeholder={f.replace(/_/g, ' ')} value={(form as any)[f]}
              onChange={e => setForm({ ...form, [f]: e.target.value })}
              className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text capitalize" />
          ))}
          <textarea placeholder="Ad copy" value={form.ad_copy} onChange={e => setForm({ ...form, ad_copy: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text h-20 resize-none" />
          <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text h-16 resize-none" />
          <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text">
            <option value="meta">Meta</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => onSave(form)} className="flex-1 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Save</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FollowModal({ onClose, onFollow }: { onClose: () => void; onFollow: (data: any) => void }) {
  const [form, setForm] = useState({ brand_name: '', platform: 'meta', platform_page_id: '' });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'var(--overlay-bg)' }} onClick={onClose}>
      <div className={`${cardCls} w-full max-w-sm`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Follow Brand</h3>
        <div className="space-y-2">
          <input placeholder="Brand Name" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text" />
          <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text">
            <option value="meta">Meta</option><option value="tiktok">TikTok</option>
          </select>
          <input placeholder="Page ID (optional)" value={form.platform_page_id} onChange={e => setForm({ ...form, platform_page_id: e.target.value })}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text" />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => onFollow(form)} className="flex-1 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Follow</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function CreativeInspoPage() {
  const [tab, setTab] = useState<'saved' | 'following'>('saved');
  const [saved, setSaved] = useState<SavedCreative[]>([]);
  const [brands, setBrands] = useState<FollowedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        fetchSavedCreatives(search ? { search } : {}),
        fetchFollowedBrands(),
      ]);
      setSaved(s.data);
      setBrands(b);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: any) => {
    try {
      await saveInspoCreative(data);
      setShowSaveModal(false);
      load();
    } catch { /* empty */ }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this saved creative?')) return;
    try { await deleteSavedCreative(id); load(); } catch { /* empty */ }
  };

  const handleFollow = async (data: any) => {
    try {
      await followBrand(data);
      setShowFollowModal(false);
      load();
    } catch { /* empty */ }
  };

  const handleUnfollow = async (id: number) => {
    if (!confirm('Unfollow this brand?')) return;
    try { await unfollowBrand(id); load(); } catch { /* empty */ }
  };

  const filteredSaved = saved.filter(s =>
    (!brandFilter || s.brand_name === brandFilter) &&
    (!search || (s.ad_copy || '').toLowerCase().includes(search.toLowerCase()) || (s.headline || '').toLowerCase().includes(search.toLowerCase()))
  );

  const uniqueBrands = [...new Set(saved.map(s => s.brand_name).filter(Boolean))];

  return (
    <PageShell title="Creative Inspo" subtitle="Save and organize competitor ads for inspiration">
      {showSaveModal && <SaveModal onClose={() => setShowSaveModal(false)} onSave={handleSave} />}
      {showFollowModal && <FollowModal onClose={() => setShowFollowModal(false)} onFollow={handleFollow} />}

      {/* Tabs + Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex gap-1 bg-ats-card rounded-lg p-1 border border-ats-border w-full sm:w-fit">
          <button onClick={() => setTab('saved')} className={`flex-1 sm:flex-initial px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === 'saved' ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'}`}>Saved Library</button>
          <button onClick={() => setTab('following')} className={`flex-1 sm:flex-initial px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === 'following' ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'}`}>Following</button>
        </div>
        {tab === 'saved' ? (
          <button onClick={() => setShowSaveModal(true)} className="w-full sm:w-auto px-4 py-3 sm:py-1.5 bg-ats-accent text-white rounded-lg text-sm font-semibold">Save New</button>
        ) : (
          <button onClick={() => setShowFollowModal(true)} className="w-full sm:w-auto px-4 py-3 sm:py-1.5 bg-ats-accent text-white rounded-lg text-sm font-semibold">Follow Brand</button>
        )}
      </div>

      {loading && <div className="h-20 bg-ats-card rounded-xl animate-pulse" />}

      {/* Saved Library Tab */}
      {!loading && tab === 'saved' && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search saved ads..."
              className="bg-ats-card border border-ats-border rounded-lg px-3 py-3 sm:py-1.5 text-sm text-ats-text flex-1" />
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
              className="bg-ats-card border border-ats-border rounded-lg px-3 py-3 sm:py-1.5 text-sm text-ats-text">
              <option value="">All Brands</option>
              {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredSaved.map(s => (
              <div key={s.id} className={cardCls}>
                {s.thumbnail_url && (
                  <img src={s.thumbnail_url} alt="" className="w-full h-40 sm:h-32 object-cover rounded-lg mb-3" />
                )}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm sm:text-xs font-semibold text-purple-400">{s.brand_name}</span>
                  <span className="text-xs sm:text-[10px] text-ats-text-muted capitalize">{s.platform}</span>
                </div>
                {s.headline && <div className="text-sm font-semibold text-ats-text mb-1">{s.headline}</div>}
                {s.ad_copy && <div className="text-sm sm:text-xs text-ats-text-muted line-clamp-3 mb-2">{s.ad_copy}</div>}
                {s.notes && <div className="text-sm sm:text-xs text-amber-400/70 italic mb-2">{s.notes}</div>}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-ats-border">
                  <span className="text-xs text-ats-text-muted">{new Date(s.saved_at).toLocaleDateString()}</span>
                  <button onClick={() => handleDelete(s.id)} className="px-3 py-1.5 text-sm sm:text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors">Remove</button>
                </div>
              </div>
            ))}
            {filteredSaved.length === 0 && (
              <div className={`${cardCls} col-span-full text-center py-8 text-ats-text-muted`}>
                No saved creatives yet. Tap "Save New" to add competitor ads.
              </div>
            )}
          </div>
        </>
      )}

      {/* Following Tab */}
      {!loading && tab === 'following' && (
        <div className="grid gap-2 sm:gap-3">
          {brands.map(b => (
            <div key={b.id} className={cardCls}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ats-text">{b.brand_name}</span>
                    <span className="text-xs text-ats-text-muted capitalize px-1.5 py-0.5 bg-ats-bg rounded">{b.platform}</span>
                  </div>
                  {b.platform_page_id && <div className="text-xs text-ats-text-muted mt-0.5">ID: {b.platform_page_id}</div>}
                  <div className="text-xs text-ats-text-muted mt-1">Since {new Date(b.followed_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => handleUnfollow(b.id)}
                  className="px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0 min-h-[44px] flex items-center">
                  Unfollow
                </button>
              </div>
            </div>
          ))}
          {brands.length === 0 && (
            <div className={`${cardCls} text-center py-8 text-ats-text-muted`}>
              Not following any brands yet. Tap "Follow Brand" to start tracking competitors.
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
