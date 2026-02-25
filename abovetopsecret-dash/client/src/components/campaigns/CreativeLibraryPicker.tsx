import { useState, useEffect, useCallback } from 'react';
import { fetchCreatives, CreativeItem } from '../../lib/api';
import { X, Search, Loader2, ImageIcon, Film, Check } from 'lucide-react';

interface CreativeLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (creative: CreativeItem) => void;
  platform?: string;
}

export default function CreativeLibraryPicker({ open, onClose, onSelect, platform }: CreativeLibraryPickerProps) {
  const [creatives, setCreatives] = useState<CreativeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadCreatives = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '40' };
      if (platform) params.platform = platform;
      if (search) params.search = search;
      if (typeFilter) params.creative_type = typeFilter;
      const result = await fetchCreatives(params);
      setCreatives(result.data);
    } catch {
      setCreatives([]);
    }
    setLoading(false);
  }, [platform, search, typeFilter]);

  useEffect(() => {
    if (open) {
      loadCreatives();
      setSelectedId(null);
    }
  }, [open, loadCreatives]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(loadCreatives, 300);
    return () => clearTimeout(timer);
  }, [search, typeFilter, open, loadCreatives]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.classList.remove('overflow-hidden');
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleConfirm = () => {
    const creative = creatives.find(c => c.id === selectedId);
    if (creative) {
      onSelect(creative);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'var(--overlay-bg)' }}>
      <div className="bg-ats-card border border-ats-border rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ats-border shrink-0">
          <h3 className="text-sm font-bold text-ats-text">Pick from Creative Library</h3>
          <button onClick={onClose} className="p-1 hover:bg-ats-hover rounded-lg transition-colors">
            <X className="w-4 h-4 text-ats-text-muted" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-ats-border flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ats-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search creatives..."
              className="w-full bg-ats-bg border border-ats-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ats-text focus:outline-none focus:border-ats-accent"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-ats-bg border border-ats-border rounded-lg px-2 py-1.5 text-xs text-ats-text focus:outline-none focus:border-ats-accent appearance-none"
          >
            <option value="">All Types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-ats-text-muted animate-spin" />
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-8 h-8 text-ats-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-ats-text-muted">No creatives found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {creatives.map((c) => {
                const isSelected = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : c.id)}
                    className={`relative text-left rounded-lg border overflow-hidden transition-all ${
                      isSelected
                        ? 'border-ats-accent ring-1 ring-ats-accent'
                        : 'border-ats-border hover:border-ats-text-muted'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-ats-bg relative">
                      {c.thumbnail_url || c.image_url ? (
                        <img
                          src={c.thumbnail_url || c.image_url}
                          alt={c.ad_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {c.creative_type === 'video' ? (
                            <Film className="w-6 h-6 text-ats-text-muted opacity-40" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-ats-text-muted opacity-40" />
                          )}
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-ats-accent/20 flex items-center justify-center">
                          <div className="w-8 h-8 bg-ats-accent rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      )}
                      {c.creative_type === 'video' && (
                        <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white">
                          VIDEO
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2">
                      <p className="text-[11px] font-semibold text-ats-text truncate">{c.ad_name || 'Untitled'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {c.spend > 0 && (
                          <span className="text-[10px] text-ats-text-muted">
                            ${Number(c.spend).toFixed(0)} spent
                          </span>
                        )}
                        {c.roas > 0 && (
                          <span className="text-[10px] text-emerald-400">
                            {Number(c.roas).toFixed(1)}x ROAS
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-ats-border flex items-center justify-between shrink-0">
          <span className="text-[10px] text-ats-text-muted">
            {creatives.length} creative{creatives.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-ats-bg border border-ats-border text-ats-text rounded-lg text-xs font-semibold hover:bg-ats-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedId === null}
              className="px-4 py-2 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Use Creative
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
