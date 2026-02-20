import { useState, useEffect } from 'react';
import PageShell from '../../components/shared/PageShell';
import {
  fetchFollowedBrands, fetchSavedCreatives,
  FollowedBrand, SavedCreative,
} from '../../lib/api';
import { getAuthToken } from '../../stores/authStore';

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

export default function CompetitorResearchPage() {
  const [brands, setBrands] = useState<FollowedBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [creatives, setCreatives] = useState<SavedCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiResult, setAiResult] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [patternsResult, setPatternsResult] = useState('');
  const [patternsStreaming, setPatternsStreaming] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const b = await fetchFollowedBrands();
        setBrands(b);
        if (b.length > 0) setSelectedBrand(b[0].brand_name);
      } catch { /* empty */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    async function loadCreatives() {
      try {
        const result = await fetchSavedCreatives({ brand_name: selectedBrand });
        setCreatives(result.data);
      } catch { /* empty */ }
    }
    loadCreatives();
  }, [selectedBrand]);

  const streamAI = async (endpoint: string, body: any, setter: (fn: (prev: string) => string) => void, setStreamState: (v: boolean) => void) => {
    setStreamState(true);
    setter(() => '');
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/creatives/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
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
            if (parsed.type === 'text') setter(prev => prev + parsed.text);
          } catch { /* ignore */ }
        }
      }
    } catch { setter(() => 'Error running analysis.'); }
    finally { setStreamState(false); }
  };

  const analyzeCompetitor = () => {
    streamAI('competitor-intel', { brand_name: selectedBrand }, setAiResult, setStreaming);
  };

  const detectPatterns = () => {
    // This calls the weekly retro endpoint as a proxy for pattern detection
    streamAI('analyze-report', { date_from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], date_to: new Date().toISOString().split('T')[0] }, setPatternsResult, setPatternsStreaming);
  };

  if (loading) return <PageShell title="Competitor Research" subtitle="Analyze competitor creative strategies"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Competitor Research" subtitle="Analyze saved competitor ads and detect creative patterns">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left: Brand List */}
        <div className="lg:col-span-1">
          <div className={cardCls}>
            <h3 className="text-sm font-semibold text-ats-text mb-3">Followed Brands</h3>
            {brands.length === 0 && (
              <div className="text-xs text-ats-text-muted text-center py-4">
                No brands followed. Go to <a href="/creative/inspo" className="text-ats-accent hover:underline">Inspo</a> to follow brands.
              </div>
            )}
            <div className="space-y-1">
              {brands.map(b => (
                <button key={b.id} onClick={() => { setSelectedBrand(b.brand_name); setAiResult(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedBrand === b.brand_name ? 'bg-ats-accent/20 text-ats-accent font-semibold' : 'text-ats-text hover:bg-ats-hover'}`}>
                  {b.brand_name}
                  <span className="text-[10px] text-ats-text-muted ml-1">({b.platform})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Content */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedBrand && (
            <div className={`${cardCls} text-center py-12 text-ats-text-muted`}>
              Select a brand to view their saved ads and run competitive analysis.
            </div>
          )}

          {selectedBrand && (
            <>
              {/* Action Buttons */}
              <div className="flex gap-2">
                <button onClick={analyzeCompetitor} disabled={streaming}
                  className="px-4 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm font-semibold hover:bg-purple-600/30 disabled:opacity-50">
                  {streaming ? 'Analyzing...' : `Analyze ${selectedBrand}`}
                </button>
                <button onClick={detectPatterns} disabled={patternsStreaming}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-50">
                  {patternsStreaming ? 'Detecting...' : 'Detect Winning Patterns'}
                </button>
              </div>

              {/* AI Analysis */}
              {(aiResult || streaming) && (
                <div className={cardCls}>
                  <h3 className="text-sm font-semibold text-ats-text mb-2">Competitor Analysis: {selectedBrand}</h3>
                  <div className="text-sm text-ats-text whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {aiResult || 'Analyzing...'}
                    {streaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />}
                  </div>
                </div>
              )}

              {(patternsResult || patternsStreaming) && (
                <div className={cardCls}>
                  <h3 className="text-sm font-semibold text-ats-text mb-2">Winning Patterns</h3>
                  <div className="text-sm text-ats-text whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {patternsResult || 'Analyzing...'}
                    {patternsStreaming && <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-1" />}
                  </div>
                </div>
              )}

              {/* Saved Ads Grid */}
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-ats-text mb-3">Saved Ads from {selectedBrand} ({creatives.length})</h3>
                {creatives.length === 0 && (
                  <div className="text-xs text-ats-text-muted text-center py-8">
                    No saved ads for this brand. Save some from the <a href="/creative/inspo" className="text-ats-accent hover:underline">Inspo library</a>.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {creatives.map(c => (
                    <div key={c.id} className="bg-ats-bg rounded-lg p-3 border border-ats-border/50">
                      {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-full h-28 object-cover rounded-lg mb-2" />}
                      {c.headline && <div className="text-sm font-semibold text-ats-text mb-1">{c.headline}</div>}
                      {c.ad_copy && <div className="text-xs text-ats-text-muted line-clamp-3 mb-1">{c.ad_copy}</div>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-ats-text-muted">{c.platform} | {new Date(c.saved_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
