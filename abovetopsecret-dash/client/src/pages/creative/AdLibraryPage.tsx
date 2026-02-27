import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  searchAdLibrary, fetchAdLibraryResults, fetchFeaturedAds, saveAdToInspo, extractTemplateFromAd,
  fetchAdLibraryRateStatus, fetchAdLibraryTrends, computeAdLibraryTrends,
  analyzeCompetitorStrategy,
  AdLibraryResult, AdLibrarySearchParams, AdLibraryTrend,
} from '../../lib/api';
import { getAuthToken } from '../../stores/authStore';
import PageShell from '../../components/shared/PageShell';
import {
  Search, Binoculars, Bookmark, LayoutTemplate, Sparkles,
  Loader2, TrendingUp, ExternalLink, Globe, X,
} from 'lucide-react';

const COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
];

const PLATFORMS = [
  { value: 'meta' as const, label: 'Meta' },
  { value: 'tiktok' as const, label: 'TikTok' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
const inputCls = 'bg-ats-card border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:outline-none focus:border-ats-accent';
const btnPrimary = 'px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-ats-accent/90 transition-colors disabled:opacity-50';

export default function AdLibraryPage() {
  const navigate = useNavigate();

  // Search state
  const [platform, setPlatform] = useState<'meta' | 'tiktok'>('meta');
  const [searchTerms, setSearchTerms] = useState('');
  const [country, setCountry] = useState('US');
  const [adStatus, setAdStatus] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Results state
  const [results, setResults] = useState<AdLibraryResult[]>([]);
  const [featuredAds, setFeaturedAds] = useState<AdLibraryResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [pagingCursor, setPagingCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // Rate limit state
  const [rateStatus, setRateStatus] = useState<{ calls_used: number; limit: number; reset_at: string } | null>(null);

  // Sidebar state
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedPageName, setSelectedPageName] = useState<string>('');
  const [trends, setTrends] = useState<AdLibraryTrend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // Mobile sheet state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // AI analysis state
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisStreaming, setAnalysisStreaming] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);

  // Action feedback
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  // Load rate status and featured ads on mount
  useEffect(() => {
    fetchAdLibraryRateStatus()
      .then(setRateStatus)
      .catch(() => {});
    fetchFeaturedAds()
      .then(setFeaturedAds)
      .catch(() => {});
  }, []);

  // Load trends when a page is selected
  useEffect(() => {
    if (!selectedPageId) {
      setTrends([]);
      return;
    }
    setTrendsLoading(true);
    fetchAdLibraryTrends(selectedPageId)
      .then(setTrends)
      .catch(() => setTrends([]))
      .finally(() => setTrendsLoading(false));
  }, [selectedPageId]);

  // Auto-scroll analysis output
  useEffect(() => {
    if (analysisRef.current && analysisStreaming) {
      analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
    }
  }, [analysisResult, analysisStreaming]);

  const handleSearch = useCallback(async () => {
    if (!searchTerms.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    setHasSearched(true);
    setPagingCursor(undefined);
    setSelectedPageId(null);
    setSelectedPageName('');
    setAnalysisResult('');

    try {
      const params: AdLibrarySearchParams = {
        platform,
        search_terms: searchTerms.trim(),
        country,
        ad_active_status: adStatus === 'ALL' ? undefined : adStatus,
      };
      const res = await searchAdLibrary(params);
      setResults(res.data);
      setPagingCursor(res.paging?.after);
      // Refresh rate status after search
      fetchAdLibraryRateStatus().then(setRateStatus).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchTerms, country, adStatus, platform]);

  const handleLoadMore = useCallback(async () => {
    if (!pagingCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params: AdLibrarySearchParams = {
        platform,
        search_terms: searchTerms.trim(),
        country,
        ad_active_status: adStatus === 'ALL' ? undefined : adStatus,
        after: pagingCursor,
      };
      const res = await searchAdLibrary(params);
      setResults(prev => [...prev, ...res.data]);
      setPagingCursor(res.paging?.after);
      fetchAdLibraryRateStatus().then(setRateStatus).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [pagingCursor, loadingMore, searchTerms, country, adStatus, platform]);

  const handleSaveToInspo = useCallback(async (ad: AdLibraryResult) => {
    setActionLoading(prev => ({ ...prev, [ad.id]: 'saving' }));
    try {
      await saveAdToInspo(ad.id);
      setActionLoading(prev => ({ ...prev, [ad.id]: 'saved' }));
      setTimeout(() => setActionLoading(prev => { const n = { ...prev }; delete n[ad.id]; return n; }), 2000);
    } catch {
      setActionLoading(prev => ({ ...prev, [ad.id]: 'error' }));
      setTimeout(() => setActionLoading(prev => { const n = { ...prev }; delete n[ad.id]; return n; }), 2000);
    }
  }, []);

  const handleExtractTemplate = useCallback(async (ad: AdLibraryResult) => {
    setActionLoading(prev => ({ ...prev, [ad.id]: 'extracting' }));
    try {
      await extractTemplateFromAd(ad.id);
      setActionLoading(prev => ({ ...prev, [ad.id]: 'extracted' }));
      setTimeout(() => setActionLoading(prev => { const n = { ...prev }; delete n[ad.id]; return n; }), 2000);
    } catch {
      setActionLoading(prev => ({ ...prev, [ad.id]: 'error' }));
      setTimeout(() => setActionLoading(prev => { const n = { ...prev }; delete n[ad.id]; return n; }), 2000);
    }
  }, []);

  const handleGenerateInspired = useCallback((ad: AdLibraryResult) => {
    navigate(`/ai/creative?inspiration=${ad.id}`);
  }, [navigate]);

  const handleSelectPage = useCallback((pageId: string, pageName: string) => {
    const deselecting = pageId === selectedPageId;
    setSelectedPageId(deselecting ? null : pageId);
    setSelectedPageName(pageName);
    setAnalysisResult('');
    setMobileSheetOpen(!deselecting);
  }, [selectedPageId]);

  const handleComputeTrends = useCallback(async () => {
    if (!selectedPageId) return;
    setTrendsLoading(true);
    try {
      const newTrend = await computeAdLibraryTrends(selectedPageId);
      setTrends(prev => [newTrend, ...prev]);
    } catch { /* empty */ }
    finally { setTrendsLoading(false); }
  }, [selectedPageId]);

  const handleAnalyzeStrategy = useCallback(async () => {
    if (!selectedPageId) return;
    setAnalysisStreaming(true);
    setAnalysisResult('');
    const token = getAuthToken();
    const { url, body } = analyzeCompetitorStrategy(selectedPageId);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') setAnalysisResult(prev => prev + parsed.text);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setAnalysisResult('Error running competitor analysis.');
    } finally {
      setAnalysisStreaming(false);
    }
  }, [selectedPageId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const formatDateRange = (start: string | null, stop: string | null) => {
    if (!start) return 'Unknown';
    const from = new Date(start).toLocaleDateString();
    if (!stop) return `${from} - Active`;
    return `${from} - ${new Date(stop).toLocaleDateString()}`;
  };

  const formatRange = (lower: number | null, upper: number | null, prefix = '') => {
    if (lower == null && upper == null) return null;
    if (lower != null && upper != null) return `${prefix}${lower.toLocaleString()} - ${prefix}${upper.toLocaleString()}`;
    if (lower != null) return `${prefix}${lower.toLocaleString()}+`;
    return `${prefix}${upper!.toLocaleString()}`;
  };

  return (
    <PageShell
      title="Ad Library Spy"
      subtitle="Search ad libraries across platforms and analyze competitor creatives"
      actions={rateStatus ? (
        <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${
          rateStatus.calls_used / rateStatus.limit > 0.8
            ? 'bg-red-500/20 text-ats-red'
            : 'bg-emerald-500/20 text-emerald-400'
        }`}>
          API: {rateStatus.calls_used}/{rateStatus.limit}
        </span>
      ) : undefined}
    >

      {/* Search Bar */}
      <div className={`${cardCls} mb-6`}>
        <div className="space-y-3">
          {/* Search input - always full width */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ats-text-muted" />
            <input
              type="text"
              value={searchTerms}
              onChange={e => setSearchTerms(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search ads by keyword, brand, or page name..."
              className={`${inputCls} w-full pl-9`}
            />
          </div>
          {/* Filters + search button */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as 'meta' | 'tiktok')}
              className={inputCls}
            >
              {PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ats-text-muted" />
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className={`${inputCls} pl-8 pr-8 appearance-none`}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            {platform === 'meta' && (
              <select
                value={adStatus}
                onChange={e => setAdStatus(e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleSearch}
              disabled={loading || !searchTerms.trim()}
              className={`${btnPrimary} ml-auto`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search
                </span>
              )}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-ats-red">
            {error}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className={`flex gap-6 ${selectedPageId ? '' : ''}`}>
        {/* Results Grid */}
        <div className={`flex-1 min-w-0 ${selectedPageId ? 'lg:mr-0' : ''}`}>
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className={`${cardCls} animate-pulse`}>
                  <div className="h-4 bg-ats-bg rounded w-3/4 mb-3" />
                  <div className="h-32 bg-ats-bg rounded mb-3" />
                  <div className="h-3 bg-ats-bg rounded w-full mb-2" />
                  <div className="h-3 bg-ats-bg rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && hasSearched && !error && (
            <div className={`${cardCls} text-center py-12 text-ats-text-muted`}>
              <Binoculars className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No ads found. Try different keywords or filters.</p>
            </div>
          )}

          {!loading && results.length === 0 && !hasSearched && featuredAds.length === 0 && (
            <div className={`${cardCls} text-center py-16 text-ats-text-muted`}>
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-semibold text-ats-text mb-1">Search Ad Libraries</p>
              <p className="text-sm">Select a platform and enter keywords to discover competitor ads, analyze strategies, and save inspiration.</p>
            </div>
          )}

          {/* Featured ads when no search yet */}
          {!loading && !hasSearched && featuredAds.length > 0 && results.length === 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-ats-text">Top Ads from Your Library</span>
                <span className="text-xs text-ats-text-muted">{featuredAds.length} ads</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {featuredAds.map(ad => (
                  <div key={ad.id} className={`${cardCls} flex flex-col hover:border-ats-accent/30 transition-colors`}>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => handleSelectPage(ad.page_id, ad.page_name)}
                        className="text-sm font-bold text-ats-text hover:text-ats-accent transition-colors truncate text-left"
                        title={`View trends for ${ad.page_name}`}
                      >
                        {ad.page_name}
                      </button>
                      {ad.ad_snapshot_url && (
                        <a href={ad.ad_snapshot_url} target="_blank" rel="noopener noreferrer" className="text-ats-text-muted hover:text-ats-accent flex-shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    {ad.ad_snapshot_url && (
                      <div className="w-full h-40 rounded-lg bg-ats-bg overflow-hidden mb-3">
                        <img src={ad.ad_snapshot_url} alt={`Ad by ${ad.page_name}`} loading="lazy" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    {ad.ad_creative_bodies?.[0] && (
                      <p className="text-xs text-ats-text-muted line-clamp-3 mb-2">{ad.ad_creative_bodies[0]}</p>
                    )}
                    {ad.ad_creative_link_titles?.[0] && (
                      <p className="text-sm font-semibold text-ats-text mb-2 truncate">{ad.ad_creative_link_titles[0]}</p>
                    )}
                    <div className="text-[11px] text-ats-text-muted mb-2">
                      {formatDateRange(ad.ad_delivery_start, ad.ad_delivery_stop)}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(() => { const v = formatRange(ad.impressions_lower, ad.impressions_upper); return v ? <span className="px-2 py-0.5 bg-ats-bg rounded text-[10px] font-mono text-ats-text-muted">Impr: {v}</span> : null; })()}
                      {(() => { const v = formatRange(ad.spend_lower, ad.spend_upper, '$'); return v ? <span className="px-2 py-0.5 bg-ats-bg rounded text-[10px] font-mono text-ats-text-muted">Spend: {v}</span> : null; })()}
                    </div>
                    <div className="mt-auto pt-2 border-t border-ats-border flex gap-1.5">
                      <button onClick={() => handleSaveToInspo(ad)} disabled={!!actionLoading[ad.id]}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors disabled:opacity-50" title="Save to Inspo">
                        <Bookmark className="w-3 h-3" />
                        {actionLoading[ad.id] === 'saving' ? 'Saving...' : actionLoading[ad.id] === 'saved' ? 'Saved!' : 'Save'}
                      </button>
                      <button onClick={() => handleExtractTemplate(ad)} disabled={!!actionLoading[ad.id]}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors disabled:opacity-50" title="Use as Template">
                        <LayoutTemplate className="w-3 h-3" />
                        {actionLoading[ad.id] === 'extracting' ? 'Extracting...' : actionLoading[ad.id] === 'extracted' ? 'Done!' : 'Template'}
                      </button>
                      <button onClick={() => handleGenerateInspired(ad)}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-purple-400 hover:bg-purple-500/10 transition-colors" title="Generate Inspired Ad">
                        <Sparkles className="w-3 h-3" />
                        Inspire
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-ats-text-muted">{results.length} results</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {results.map(ad => (
                  <div key={ad.id} className={`${cardCls} flex flex-col hover:border-ats-accent/30 transition-colors`}>
                    {/* Page name */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => handleSelectPage(ad.page_id, ad.page_name)}
                        className="text-sm font-bold text-ats-text hover:text-ats-accent transition-colors truncate text-left"
                        title={`View trends for ${ad.page_name}`}
                      >
                        {ad.page_name}
                      </button>
                      {ad.ad_snapshot_url && (
                        <a
                          href={ad.ad_snapshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ats-text-muted hover:text-ats-accent flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Snapshot image */}
                    {ad.ad_snapshot_url && (
                      <div className="w-full h-40 rounded-lg bg-ats-bg overflow-hidden mb-3">
                        <img
                          src={ad.ad_snapshot_url}
                          alt={`Ad by ${ad.page_name}`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}

                    {/* Creative body */}
                    {ad.ad_creative_bodies?.[0] && (
                      <p className="text-xs text-ats-text-muted line-clamp-3 mb-2">
                        {ad.ad_creative_bodies[0]}
                      </p>
                    )}

                    {/* Headline */}
                    {ad.ad_creative_link_titles?.[0] && (
                      <p className="text-sm font-semibold text-ats-text mb-2 truncate">
                        {ad.ad_creative_link_titles[0]}
                      </p>
                    )}

                    {/* Date range */}
                    <div className="text-[11px] text-ats-text-muted mb-2">
                      {formatDateRange(ad.ad_delivery_start, ad.ad_delivery_stop)}
                    </div>

                    {/* Metrics */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(() => {
                        const impressions = formatRange(ad.impressions_lower, ad.impressions_upper);
                        return impressions ? (
                          <span className="px-2 py-0.5 bg-ats-bg rounded text-[10px] font-mono text-ats-text-muted">
                            Impr: {impressions}
                          </span>
                        ) : null;
                      })()}
                      {(() => {
                        const spend = formatRange(ad.spend_lower, ad.spend_upper, '$');
                        return spend ? (
                          <span className="px-2 py-0.5 bg-ats-bg rounded text-[10px] font-mono text-ats-text-muted">
                            Spend: {spend}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Publisher platforms */}
                    {ad.publisher_platforms?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {ad.publisher_platforms.map(p => (
                          <span key={p} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px] capitalize">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-auto pt-2 border-t border-ats-border flex gap-1.5">
                      <button
                        onClick={() => handleSaveToInspo(ad)}
                        disabled={!!actionLoading[ad.id]}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors disabled:opacity-50"
                        title="Save to Inspo"
                      >
                        <Bookmark className="w-3 h-3" />
                        {actionLoading[ad.id] === 'saving' ? 'Saving...' :
                         actionLoading[ad.id] === 'saved' ? 'Saved!' :
                         'Save'}
                      </button>
                      <button
                        onClick={() => handleExtractTemplate(ad)}
                        disabled={!!actionLoading[ad.id]}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-ats-text-muted hover:bg-ats-hover hover:text-ats-text transition-colors disabled:opacity-50"
                        title="Use as Template"
                      >
                        <LayoutTemplate className="w-3 h-3" />
                        {actionLoading[ad.id] === 'extracting' ? 'Extracting...' :
                         actionLoading[ad.id] === 'extracted' ? 'Done!' :
                         'Template'}
                      </button>
                      <button
                        onClick={() => handleGenerateInspired(ad)}
                        className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded text-[11px] font-semibold text-purple-400 hover:bg-purple-500/10 transition-colors"
                        title="Generate Inspired Ad"
                      >
                        <Sparkles className="w-3 h-3" />
                        Inspire
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More */}
              {pagingCursor && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className={`${btnPrimary} px-8`}
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more...
                      </span>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar */}
        {selectedPageId && (
          <div className="hidden lg:block w-80 flex-shrink-0 space-y-4">
            {/* Page header */}
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-ats-text truncate">{selectedPageName}</h3>
                <button
                  onClick={() => { setSelectedPageId(null); setSelectedPageName(''); setAnalysisResult(''); }}
                  className="text-ats-text-muted hover:text-ats-text text-xs"
                >
                  Close
                </button>
              </div>
              <p className="text-[11px] text-ats-text-muted">Page ID: {selectedPageId}</p>
            </div>

            {/* Trends data */}
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-ats-text flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-ats-accent" />
                  Ad Trends
                </h4>
                <button
                  onClick={handleComputeTrends}
                  disabled={trendsLoading}
                  className="text-[10px] font-semibold text-ats-accent hover:text-ats-accent/80 disabled:opacity-50"
                >
                  {trendsLoading ? 'Computing...' : 'Refresh'}
                </button>
              </div>

              {trendsLoading && trends.length === 0 && (
                <div className="h-16 bg-ats-bg rounded animate-pulse" />
              )}

              {!trendsLoading && trends.length === 0 && (
                <p className="text-xs text-ats-text-muted text-center py-4">
                  No trend data yet. Click Refresh to compute.
                </p>
              )}

              {trends.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ats-border">
                        <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Date</th>
                        <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Active</th>
                        <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">New</th>
                        <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Stopped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trends.slice(0, 10).map(t => (
                        <tr key={t.id} className="border-b border-ats-border/50 last:border-0">
                          <td className="px-2 py-1 text-[11px] text-ats-text">{new Date(t.date).toLocaleDateString()}</td>
                          <td className="px-2 py-1 text-[11px] text-ats-text text-right font-mono">{t.active_ad_count}</td>
                          <td className="px-2 py-1 text-[11px] text-emerald-400 text-right font-mono">+{t.new_ads}</td>
                          <td className="px-2 py-1 text-[11px] text-ats-red text-right font-mono">-{t.stopped_ads}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {trends.length > 0 && trends[0].themes?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-ats-border">
                  <p className="text-[10px] font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">Themes</p>
                  <div className="flex flex-wrap gap-1">
                    {trends[0].themes.map((theme, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px]">
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Analysis */}
            <div className={cardCls}>
              <button
                onClick={handleAnalyzeStrategy}
                disabled={analysisStreaming}
                className="w-full px-4 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm font-semibold hover:bg-purple-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {analysisStreaming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing Strategy...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze Strategy
                  </>
                )}
              </button>

              {(analysisResult || analysisStreaming) && (
                <div
                  ref={analysisRef}
                  className="mt-3 bg-ats-bg rounded-lg p-3 text-sm text-ats-text whitespace-pre-wrap max-h-96 overflow-y-auto"
                >
                  {analysisResult || 'Analyzing...'}
                  {analysisStreaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet for Competitor Analysis */}
      {selectedPageId && (
        <>
          {/* Backdrop */}
          <div
            className={`lg:hidden fixed inset-0 z-40 transition-opacity ${mobileSheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ backgroundColor: 'var(--overlay-bg)' }}
            onClick={() => setMobileSheetOpen(false)}
          />
          {/* Sheet */}
          <div
            className={`lg:hidden fixed inset-x-0 bottom-0 z-50 bg-ats-card border-t border-ats-border rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-out ${mobileSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-ats-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-1 rounded-full bg-ats-border" />
                <h3 className="text-sm font-bold text-ats-text truncate">{selectedPageName}</h3>
              </div>
              <button
                onClick={() => setMobileSheetOpen(false)}
                className="p-2 rounded-lg hover:bg-ats-hover text-ats-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto p-4 space-y-4">
              {/* Page header */}
              <div className={cardCls}>
                <p className="text-[11px] text-ats-text-muted">Page ID: {selectedPageId}</p>
              </div>

              {/* Trends data */}
              <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-ats-text flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-ats-accent" />
                    Ad Trends
                  </h4>
                  <button
                    onClick={handleComputeTrends}
                    disabled={trendsLoading}
                    className="text-[10px] font-semibold text-ats-accent hover:text-ats-accent/80 disabled:opacity-50"
                  >
                    {trendsLoading ? 'Computing...' : 'Refresh'}
                  </button>
                </div>

                {trendsLoading && trends.length === 0 && (
                  <div className="h-16 bg-ats-bg rounded animate-pulse" />
                )}

                {!trendsLoading && trends.length === 0 && (
                  <p className="text-xs text-ats-text-muted text-center py-4">
                    No trend data yet. Click Refresh to compute.
                  </p>
                )}

                {trends.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-ats-border">
                          <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Date</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Active</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">New</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ats-text-muted">Stopped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trends.slice(0, 10).map(t => (
                          <tr key={t.id} className="border-b border-ats-border/50 last:border-0">
                            <td className="px-2 py-1 text-[11px] text-ats-text">{new Date(t.date).toLocaleDateString()}</td>
                            <td className="px-2 py-1 text-[11px] text-ats-text text-right font-mono">{t.active_ad_count}</td>
                            <td className="px-2 py-1 text-[11px] text-emerald-400 text-right font-mono">+{t.new_ads}</td>
                            <td className="px-2 py-1 text-[11px] text-ats-red text-right font-mono">-{t.stopped_ads}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {trends.length > 0 && trends[0].themes?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-ats-border">
                    <p className="text-[10px] font-semibold text-ats-text-muted uppercase tracking-wider mb-1.5">Themes</p>
                    <div className="flex flex-wrap gap-1">
                      {trends[0].themes.map((theme: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px]">
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              <div className={cardCls}>
                <button
                  onClick={handleAnalyzeStrategy}
                  disabled={analysisStreaming}
                  className="w-full px-4 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm font-semibold hover:bg-purple-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {analysisStreaming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing Strategy...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyze Strategy
                    </>
                  )}
                </button>

                {(analysisResult || analysisStreaming) && (
                  <div className="mt-3 bg-ats-bg rounded-lg p-3 text-sm text-ats-text whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {analysisResult || 'Analyzing...'}
                    {analysisStreaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
