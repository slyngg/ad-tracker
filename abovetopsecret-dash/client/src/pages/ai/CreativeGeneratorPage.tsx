import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '../../components/shared/PageShell';
import {
  fetchBrandConfigs,
  fetchCreativeTemplates,
  generateAdCopy,
  generateAdCopyStream,
  generateVariations,
  generateABTestSuggestions,
  extractCreativeTemplate,
  BrandConfig,
  CreativeTemplate,
} from '../../lib/api';
import {
  Sparkles,
  Send,
  Copy,
  Star,
  Wand2,
  FlaskConical,
  Loader2,
  LayoutTemplate,
  ChevronRight,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { getAuthToken } from '../../stores/authStore';

// ── Types ──────────────────────────────────────────────────────────

interface Variation {
  headline?: string;
  primary_text?: string;
  description?: string;
  cta?: string;
  hook?: string;
  rationale?: string;
  [key: string]: string | undefined;
}

interface GenCreative {
  id: number;
  creative_type: string;
  platform: string;
  content: { variations?: Variation[]; brief?: string; [key: string]: any };
  rating: number | null;
  created_at: string;
}

type CreativeType = 'full_ad' | 'headline' | 'ad_copy' | 'description';
type Platform = 'meta' | 'instagram' | 'tiktok' | 'google' | 'general';

const CREATIVE_TYPES: { value: CreativeType; label: string }[] = [
  { value: 'full_ad', label: 'Full Ad' },
  { value: 'headline', label: 'Headline' },
  { value: 'ad_copy', label: 'Ad Copy' },
  { value: 'description', label: 'Description' },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'general', label: 'General' },
];

// ── Helpers ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

const inputCls =
  'w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text placeholder:text-ats-text-muted focus:outline-none focus:ring-1 focus:ring-ats-accent';
const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity';
const btnSecondary =
  'inline-flex items-center gap-2 px-3 py-1.5 bg-ats-bg border border-ats-border text-ats-text rounded-lg text-xs font-medium hover:bg-ats-hover transition-colors';

// ── Component ──────────────────────────────────────────────────────

export default function CreativeGeneratorPage() {
  const navigate = useNavigate();

  // Input state
  const [creativeType, setCreativeType] = useState<CreativeType>('full_ad');
  const [platform, setPlatform] = useState<Platform>('meta');
  const [brief, setBrief] = useState('');
  const [brandConfigId, setBrandConfigId] = useState<number | undefined>();
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [variationCount, setVariationCount] = useState(3);

  // Data state
  const [brandConfigs, setBrandConfigs] = useState<BrandConfig[]>([]);
  const [templates, setTemplates] = useState<CreativeTemplate[]>([]);
  const [history, setHistory] = useState<GenCreative[]>([]);

  // Load error state
  const [brandConfigError, setBrandConfigError] = useState(false);

  // Result state
  const [result, setResult] = useState<GenCreative | null>(null);
  const [generating, setGenerating] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<number, number>>({});

  const streamAbortRef = useRef<AbortController | null>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  // ── Load data on mount ───────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiFetch<GenCreative[]>('/creative-gen');
      setHistory(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchBrandConfigs()
      .then((data) => {
        setBrandConfigs(data);
        setBrandConfigError(false);
      })
      .catch(() => {
        setBrandConfigError(true);
      });
    fetchCreativeTemplates()
      .then(setTemplates)
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  // ── Generate (non-streaming) ─────────────────────────────────────

  const handleGenerate = async () => {
    if (!brief.trim()) return;
    setError(null);
    setGenerating(true);
    setResult(null);
    setStreamText('');
    try {
      const res = await generateAdCopy({
        creative_type: creativeType,
        platform,
        brief: brief.trim(),
        brand_config_id: brandConfigId,
        template_id: templateId,
        variation_count: variationCount,
      });
      setResult(res);
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Generate (streaming) ─────────────────────────────────────────

  const handleStream = async () => {
    if (!brief.trim()) return;
    setError(null);
    setStreaming(true);
    setResult(null);
    setStreamText('');

    const { url, body } = generateAdCopyStream({
      creative_type: creativeType,
      platform,
      brief: brief.trim(),
      brand_config_id: brandConfigId,
      template_id: templateId,
      variation_count: variationCount,
    });

    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const token = getAuthToken();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Stream error ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              // Stream complete — try to parse full result
              try {
                const parsed = JSON.parse(fullText);
                setResult(parsed);
                setStreamText('');
              } catch {
                // Could not parse as JSON, leave stream text visible
              }
              continue;
            }
            try {
              const chunk = JSON.parse(payload);
              if (chunk.text) {
                fullText += chunk.text;
                setStreamText(fullText);
              }
              if (chunk.result) {
                setResult(chunk.result);
                setStreamText('');
              }
            } catch {
              // plain text chunk
              fullText += payload;
              setStreamText(fullText);
            }
          }
        }
      }

      loadHistory();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err?.message || 'Streaming failed');
      }
    } finally {
      setStreaming(false);
      streamAbortRef.current = null;
    }
  };

  // Auto-scroll stream container
  useEffect(() => {
    if (streamContainerRef.current && streamText) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight;
    }
  }, [streamText]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleCopy = (variation: Variation, idx: number) => {
    const text = Object.entries(variation)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleRate = async (id: number, rating: number) => {
    try {
      await apiFetch(`/creative-gen/${id}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });
      setRatings((prev) => ({ ...prev, [id]: rating }));
      loadHistory();
    } catch {
      // silent
    }
  };

  const handleUseAsTemplate = async (creativeId: number) => {
    try {
      await extractCreativeTemplate(creativeId);
      fetchCreativeTemplates()
        .then(setTemplates)
        .catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Failed to extract template');
    }
  };

  const handlePushToCampaign = (variation: Variation) => {
    navigate('/campaigns/builder', {
      state: {
        creative: {
          headline: variation.headline,
          primary_text: variation.primary_text,
          description: variation.description,
          cta: variation.cta,
        },
      },
    });
  };

  const handleGenerateVariations = async () => {
    if (!result?.id) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateVariations(result.id, variationCount);
      setResult(res);
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate variations');
    } finally {
      setGenerating(false);
    }
  };

  const handleABTest = async () => {
    if (!result?.id) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateABTestSuggestions(result.id);
      setResult(res);
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate A/B suggestions');
    } finally {
      setGenerating(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────

  const variations: Variation[] = result?.content?.variations || [];
  const selectedBrand = brandConfigs.find((b) => b.id === brandConfigId);
  const isWorking = generating || streaming;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <PageShell
      title="Creative Generator"
      subtitle="AI-powered ad copy generation"
      actions={
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-ats-accent" />
          <span className="text-xs text-ats-text-muted">
            {history.length} generated
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── Left Panel: Input ──────────────────────────────────── */}
        <div className="order-2 lg:order-none lg:col-span-3 space-y-4">
          <div className={cardCls}>
            <h3 className="text-sm font-semibold text-ats-text mb-4 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-ats-accent" />
              Configuration
            </h3>

            {/* Creative Type */}
            <label className="block mb-3">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Creative Type
              </span>
              <select
                value={creativeType}
                onChange={(e) => setCreativeType(e.target.value as CreativeType)}
                className={inputCls}
              >
                {CREATIVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Platform */}
            <label className="block mb-3">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Platform
              </span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className={inputCls}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Brief */}
            <label className="block mb-3">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Brief <span className="text-ats-red">*</span>
              </span>
              <textarea
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe your product, audience, and campaign goals..."
                className={inputCls + ' resize-y'}
              />
            </label>

            {/* Brand Config */}
            <label className="block mb-3">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Brand Config
              </span>
              <select
                value={brandConfigId ?? ''}
                onChange={(e) =>
                  setBrandConfigId(e.target.value ? Number(e.target.value) : undefined)
                }
                className={inputCls}
              >
                <option value="">None</option>
                {brandConfigs.map((bc) => (
                  <option key={bc.id} value={bc.id}>
                    {bc.name}
                    {bc.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              {brandConfigError && brandConfigs.length === 0 && (
                <span className="flex items-center gap-1 text-[11px] text-amber-400 mt-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Failed to load brand configs
                </span>
              )}
            </label>

            {/* Template */}
            <label className="block mb-3">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Template
              </span>
              <select
                value={templateId ?? ''}
                onChange={(e) =>
                  setTemplateId(e.target.value ? Number(e.target.value) : undefined)
                }
                className={inputCls}
              >
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Variation Count */}
            <label className="block mb-4">
              <span className="text-xs text-ats-text-muted uppercase tracking-wide mb-1 block">
                Variations ({variationCount})
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={variationCount}
                onChange={(e) => setVariationCount(Number(e.target.value))}
                className="w-full accent-ats-accent"
              />
              <div className="flex justify-between text-[10px] text-ats-text-muted mt-0.5">
                <span>1</span>
                <span>5</span>
              </div>
            </label>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleGenerate}
                disabled={isWorking || !brief.trim()}
                className={btnPrimary + ' justify-center'}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate
              </button>
              <button
                onClick={handleStream}
                disabled={isWorking || !brief.trim()}
                className={btnSecondary + ' justify-center'}
              >
                {streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Generate (Stream)
              </button>
            </div>
          </div>
        </div>

        {/* ── Center Panel: Results ──────────────────────────────── */}
        <div className="order-1 lg:order-none lg:col-span-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-ats-red">
              {error}
            </div>
          )}

          {/* Streaming Output */}
          {streaming && (
            <div className={cardCls}>
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-4 h-4 text-ats-accent animate-spin" />
                <span className="text-xs font-medium text-ats-text-muted uppercase tracking-wide">
                  Streaming...
                </span>
                <button
                  onClick={() => streamAbortRef.current?.abort()}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-ats-red rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
              <div
                ref={streamContainerRef}
                className="bg-ats-bg rounded-lg p-3 max-h-80 overflow-y-auto font-mono text-xs text-ats-text whitespace-pre-wrap leading-relaxed"
              >
                {streamText || (
                  <span className="text-ats-text-muted">Waiting for response...</span>
                )}
                <span className="inline-block w-2 h-4 bg-ats-accent/70 animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          )}

          {/* Working Spinner (non-streaming) */}
          {generating && !streaming && (
            <div className={`${cardCls} flex items-center justify-center py-16`}>
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-ats-accent animate-spin mx-auto mb-3" />
                <p className="text-sm text-ats-text-muted">Generating {variationCount} variation{variationCount > 1 ? 's' : ''}...</p>
              </div>
            </div>
          )}

          {/* Variation Cards */}
          {!generating && !streaming && variations.length > 0 && (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ats-text">
                  {variations.length} Variation{variations.length > 1 ? 's' : ''}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleGenerateVariations}
                    disabled={isWorking}
                    className={btnSecondary}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Generate Variations
                  </button>
                  <button
                    onClick={handleABTest}
                    disabled={isWorking}
                    className={btnSecondary}
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    A/B Test Suggestions
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {variations.map((v, i) => (
                  <div key={i} className={`${cardCls} flex flex-col`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-ats-accent uppercase tracking-wide">
                        Variation {i + 1}
                      </span>
                      {/* Star Rating */}
                      {result?.id && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              onClick={() => handleRate(result.id, s)}
                              className="p-1.5"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  (ratings[result.id] ?? result.rating ?? 0) >= s
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-gray-600'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Content Fields */}
                    <div className="space-y-2.5 flex-1">
                      {v.headline && (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            Headline
                          </span>
                          <p className="text-sm font-bold text-ats-text mt-0.5">
                            {v.headline}
                          </p>
                        </div>
                      )}
                      {v.primary_text && (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            Primary Text
                          </span>
                          <p className="text-sm text-ats-text mt-0.5 leading-relaxed">
                            {v.primary_text}
                          </p>
                        </div>
                      )}
                      {v.description && (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            Description
                          </span>
                          <p className="text-sm text-ats-text mt-0.5">
                            {v.description}
                          </p>
                        </div>
                      )}
                      {v.cta && (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            CTA
                          </span>
                          <p className="text-sm text-ats-accent font-semibold mt-0.5">
                            {v.cta}
                          </p>
                        </div>
                      )}
                      {v.hook && (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            Hook
                          </span>
                          <p className="text-sm text-ats-text mt-0.5 italic">
                            {v.hook}
                          </p>
                        </div>
                      )}
                      {v.rationale && (
                        <div className="bg-ats-bg/50 rounded-lg p-2 mt-1">
                          <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                            Rationale
                          </span>
                          <p className="text-xs text-ats-text-muted mt-0.5 leading-relaxed">
                            {v.rationale}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-ats-border">
                      <button
                        onClick={() => handleCopy(v, i)}
                        className={btnSecondary}
                      >
                        <Copy className="w-3 h-3" />
                        {copiedIdx === i ? 'Copied!' : 'Copy'}
                      </button>
                      {result?.id && (
                        <button
                          onClick={() => handleUseAsTemplate(result.id)}
                          className={btnSecondary}
                        >
                          <LayoutTemplate className="w-3 h-3" />
                          Use as Template
                        </button>
                      )}
                      <button
                        onClick={() => handlePushToCampaign(v)}
                        className={btnSecondary}
                      >
                        <ChevronRight className="w-3 h-3" />
                        Push to Campaign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {!generating && !streaming && variations.length === 0 && !error && !streamText && (
            <div className={`${cardCls} flex flex-col items-center justify-center py-20 text-center`}>
              <Sparkles className="w-10 h-10 text-ats-text-muted mb-4 opacity-30" />
              <h3 className="text-sm font-semibold text-ats-text mb-1">
                No creatives yet
              </h3>
              <p className="text-xs text-ats-text-muted max-w-xs">
                Fill in the brief on the left and hit Generate to create AI-powered ad copy variations.
              </p>
            </div>
          )}

          {/* Stream text displayed after stream ends without parsed result */}
          {!streaming && !result && streamText && (
            <div className={cardCls}>
              <h3 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-2">
                Generated Output
              </h3>
              <div className="bg-ats-bg rounded-lg p-3 font-mono text-xs text-ats-text whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {streamText}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel: Context ───────────────────────────────── */}
        <div className="order-3 lg:order-none lg:col-span-3 space-y-4">
          {/* Brand Config Summary */}
          <div className={cardCls}>
            <h3 className="text-sm font-semibold text-ats-text mb-3 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-ats-accent" />
              Brand Config
            </h3>
            {selectedBrand ? (
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                    Brand
                  </span>
                  <p className="text-sm text-ats-text font-medium">
                    {selectedBrand.brand_name}
                  </p>
                </div>
                {selectedBrand.tone_of_voice && (
                  <div>
                    <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                      Tone
                    </span>
                    <p className="text-xs text-ats-text">{selectedBrand.tone_of_voice}</p>
                  </div>
                )}
                {selectedBrand.target_audience && (
                  <div>
                    <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                      Audience
                    </span>
                    <p className="text-xs text-ats-text">
                      {selectedBrand.target_audience}
                    </p>
                  </div>
                )}
                {selectedBrand.usp && (
                  <div>
                    <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                      USP
                    </span>
                    <p className="text-xs text-ats-text">{selectedBrand.usp}</p>
                  </div>
                )}
                {selectedBrand.guidelines && (
                  <div>
                    <span className="text-[10px] text-ats-text-muted uppercase tracking-wider">
                      Guidelines
                    </span>
                    <p className="text-xs text-ats-text-muted line-clamp-4">
                      {selectedBrand.guidelines}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-ats-text-muted">
                Select a brand config to see details here.
              </p>
            )}
          </div>

          {/* Generation History */}
          <div className={cardCls}>
            <h3 className="text-sm font-semibold text-ats-text mb-3">
              Recent Generations
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-ats-text-muted">No history yet.</p>
            ) : (
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {history.slice(0, 20).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setResult(h);
                      setStreamText('');
                      setError(null);
                    }}
                    className={`w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-ats-hover transition-colors group ${
                      result?.id === h.id ? 'bg-ats-hover' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-ats-text font-medium capitalize truncate">
                          {h.creative_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-ats-text-muted capitalize">
                          {h.platform}
                        </span>
                      </div>
                      {h.content?.brief && (
                        <p className="text-[10px] text-ats-text-muted truncate mt-0.5 max-w-[180px]">
                          {h.content.brief}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {h.rating && (
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-[10px] text-amber-400">{h.rating}</span>
                        </div>
                      )}
                      <span className="text-[10px] text-ats-text-muted">
                        {new Date(h.created_at).toLocaleDateString()}
                      </span>
                      <ChevronRight className="w-3 h-3 text-ats-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
