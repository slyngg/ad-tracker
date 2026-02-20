import { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { fetchApiKeys, generateApiKey, ApiKey } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

const ALL_METRICS = [
  { key: 'spend', label: 'Spend' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'roas', label: 'ROAS' },
  { key: 'cpa', label: 'CPA' },
  { key: 'conversions', label: 'Conversions' },
] as const;

const POSITIONS = [
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'inline', label: 'Inline' },
] as const;

export default function WidgetConfigPage() {
  // Config state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    ALL_METRICS.map((m) => m.key)
  );
  const [position, setPosition] = useState('bottom-right');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // API key state
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [selectedKeyPrefix, setSelectedKeyPrefix] = useState<string>('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy state
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const data = await fetchApiKeys();
      setKeys(data);
      if (data.length > 0 && !selectedKeyPrefix) {
        setSelectedKeyPrefix(data[0].key_prefix);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingKeys(false);
    }
  }, [selectedKeyPrefix]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleMetricToggle = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const handleGenerateKey = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateApiKey('Widget');
      setGeneratedKey(result.key);
      setSelectedKeyPrefix(result.prefix);
      loadKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const displayKey = generatedKey || (selectedKeyPrefix ? `${selectedKeyPrefix}...` : 'YOUR_KEY');

  const embedCode = useMemo(() => {
    const attrs = [
      `  data-api-key="${displayKey}"`,
      `  data-host="${window.location.origin}"`,
      `  data-theme="${theme}"`,
      `  data-metrics="${selectedMetrics.join(',')}"`,
      `  data-position="${position}"`,
    ];
    if (!autoRefresh) {
      attrs.push('  data-auto-refresh="false"');
    }
    return `<script src="${window.location.origin}/widget.js"\n${attrs.join('\n')}>\n</script>`;
  }, [displayKey, theme, selectedMetrics, position, autoRefresh]);

  const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const inputCls =
    'w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent';
  const labelCls = 'text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide';

  return (
    <PageShell title="Embeddable Widget" subtitle="Add live metrics to your own site">
      {error && (
        <div className="px-3 py-2 mb-4 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left Column: Configuration */}
        <div className="space-y-4">
          {/* Theme */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <h3 className="text-sm font-bold text-ats-text mb-4">Theme</h3>
            <div className="flex gap-3">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                    theme === t
                      ? 'bg-ats-accent border-ats-accent text-white'
                      : 'bg-ats-bg border-ats-border text-ats-text-muted hover:text-ats-text hover:border-ats-text-muted'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <h3 className="text-sm font-bold text-ats-text mb-4">Metrics to Display</h3>
            <div className="space-y-2">
              {ALL_METRICS.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.key)}
                    onChange={() => handleMetricToggle(m.key)}
                    className="w-4 h-4 rounded border-ats-border bg-ats-bg text-ats-accent focus:ring-ats-accent accent-blue-500"
                  />
                  <span className="text-sm text-ats-text-muted group-hover:text-ats-text transition-colors">
                    {m.label}
                  </span>
                </label>
              ))}
            </div>
            {selectedMetrics.length === 0 && (
              <p className="text-xs text-red-400 mt-2">Select at least one metric</p>
            )}
          </div>

          {/* Position */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <h3 className="text-sm font-bold text-ats-text mb-4">Position</h3>
            <label className={labelCls}>Widget placement</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className={inputCls}
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ats-text-muted/60 mt-1.5">
              {position === 'inline'
                ? 'Widget renders in place of the script tag'
                : `Widget appears as a fixed overlay at the ${position.replace('-', ' ')}`}
            </p>
          </div>

          {/* Auto-refresh */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ats-text">Auto-Refresh</h3>
                <p className="text-[11px] text-ats-text-muted mt-0.5">
                  Connect via WebSocket for live updates
                </p>
              </div>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  autoRefresh ? 'bg-ats-accent' : 'bg-ats-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                    autoRefresh ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: API Key + Embed Code */}
        <div className="space-y-4">
          {/* API Key */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <h3 className="text-sm font-bold text-ats-text mb-4">API Key</h3>

            {loadingKeys ? (
              <p className="text-xs text-ats-text-muted">Loading keys...</p>
            ) : keys.length === 0 && !generatedKey ? (
              <div>
                <p className="text-xs text-ats-text-muted mb-3">
                  No API keys found. Generate one to use with the widget.
                </p>
                <button
                  onClick={handleGenerateKey}
                  disabled={generating}
                  className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                >
                  {generating ? 'Generating...' : 'Generate Widget Key'}
                </button>
              </div>
            ) : (
              <div>
                {/* Key selector if multiple */}
                {keys.length > 1 && !generatedKey && (
                  <div className="mb-3">
                    <label className={labelCls}>Select key</label>
                    <select
                      value={selectedKeyPrefix}
                      onChange={(e) => {
                        setSelectedKeyPrefix(e.target.value);
                        setGeneratedKey(null);
                      }}
                      className={inputCls}
                    >
                      {keys.map((k) => (
                        <option key={k.id} value={k.key_prefix}>
                          {k.name} ({k.key_prefix}...)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Display key */}
                <div className="bg-ats-bg border border-ats-border rounded-lg p-3 flex items-center gap-2">
                  <code className="text-sm text-ats-green font-mono flex-1 break-all">
                    {displayKey}
                  </code>
                  {generatedKey && (
                    <button
                      onClick={() => copyToClipboard(generatedKey, setCopiedKey)}
                      className="shrink-0 px-3 py-1.5 bg-ats-accent text-white rounded text-xs font-semibold hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      {copiedKey ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>

                {generatedKey && (
                  <p className="text-[11px] text-amber-400 mt-2">
                    Save this key now -- it will not be shown again.
                  </p>
                )}

                {/* Generate another */}
                <button
                  onClick={handleGenerateKey}
                  disabled={generating}
                  className="mt-3 flex items-center gap-1.5 text-xs text-ats-text-muted hover:text-ats-accent transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                  Generate new key
                </button>
              </div>
            )}
          </div>

          {/* Generated Embed Code */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-ats-text">Embed Code</h3>
              <button
                onClick={() => copyToClipboard(embedCode, setCopiedEmbed)}
                className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors flex items-center gap-1.5"
              >
                {copiedEmbed ? <Check size={12} /> : <Copy size={12} />}
                {copiedEmbed ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div className="bg-ats-bg border border-ats-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs text-ats-text font-mono whitespace-pre">{embedCode}</pre>
            </div>

            <p className="text-[11px] text-ats-text-muted/60 mt-2">
              Paste this snippet into the HTML of any page where you want the widget to appear.
            </p>
          </div>

          {/* Live Preview */}
          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            <h3 className="text-sm font-bold text-ats-text mb-4">Preview</h3>
            <WidgetPreview
              theme={theme}
              metrics={selectedMetrics}
              position={position}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/* ── Inline Preview Component ──────────────────────────────────── */

function WidgetPreview({
  theme,
  metrics,
}: {
  theme: 'light' | 'dark';
  metrics: string[];
  position: string;
}) {
  const isDark = theme === 'dark';

  const sampleData: Record<string, { label: string; value: string; color?: string }> = {
    spend: { label: 'Spend', value: '$1.2K' },
    revenue: { label: 'Revenue', value: '$4.8K', color: isDark ? '#10b981' : '#059669' },
    roas: { label: 'ROAS', value: '3.94x', color: isDark ? '#10b981' : '#059669' },
    cpa: { label: 'CPA', value: '$18.50' },
    conversions: { label: 'Conversions', value: '64' },
  };

  const visibleMetrics = metrics.filter((m) => sampleData[m]);

  const bg = isDark ? '#0a0b0e' : '#ffffff';
  const cardBg = isDark ? '#111318' : '#f9fafb';
  const text = isDark ? '#f9fafb' : '#111827';
  const muted = isDark ? '#6b7280' : '#9ca3af';
  const border = isDark ? '#1f2937' : '#e5e7eb';

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: 16,
        maxWidth: 400,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 12,
          color: muted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        OpticData Live
      </div>
      {visibleMetrics.length === 0 ? (
        <div style={{ fontSize: 12, color: muted }}>No metrics selected</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: visibleMetrics.length === 1 ? '1fr' : '1fr 1fr',
            gap: 8,
          }}
        >
          {visibleMetrics.map((key) => {
            const m = sampleData[key];
            return (
              <div
                key={key}
                style={{
                  background: cardBg,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 2,
                    color: muted,
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: 'ui-monospace, monospace',
                    color: m.color || text,
                  }}
                >
                  {m.value}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div
        style={{
          fontSize: 9,
          marginTop: 8,
          textAlign: 'right',
          color: isDark ? '#4b5563' : '#9ca3af',
        }}
      >
        Updated just now (preview)
      </div>
    </div>
  );
}
