import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSettings, updateSettings, fetchPixelConfigs, savePixelConfig, PixelConfig } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

const UTM_PARAMS = [
  { key: 'utm_source', label: 'UTM Source', description: 'Identifies the traffic source (e.g., facebook, google)' },
  { key: 'utm_medium', label: 'UTM Medium', description: 'Identifies the marketing medium (e.g., cpc, email, social)' },
  { key: 'utm_campaign', label: 'UTM Campaign', description: 'Identifies the specific campaign name' },
  { key: 'utm_content', label: 'UTM Content', description: 'Differentiates ads or links pointing to the same URL' },
  { key: 'utm_term', label: 'UTM Term', description: 'Identifies paid search keywords' },
];

const FIELD_OPTIONS = [
  'source',
  'medium',
  'campaign_name',
  'ad_set_name',
  'ad_name',
  'keyword',
  'offer_name',
  'account_name',
];

const ATTRIBUTION_WINDOWS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '28', label: '28 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
];

const ATTRIBUTION_MODELS = [
  { value: 'last_click', label: 'Last Click', description: 'Gives 100% credit to the last touchpoint before conversion' },
  { value: 'first_click', label: 'First Click', description: 'Gives 100% credit to the first touchpoint' },
  { value: 'linear', label: 'Linear', description: 'Distributes credit equally across all touchpoints' },
  { value: 'time_decay', label: 'Time Decay', description: 'More credit to touchpoints closer to conversion' },
];

const FUNNEL_PAGES = [
  { key: 'landing', label: 'Landing Page', description: 'Initial landing/presell page' },
  { key: 'checkout', label: 'Checkout', description: 'Main checkout/order form page' },
  { key: 'upsell1', label: 'Upsell 1', description: 'First upsell offer page' },
  { key: 'upsell2', label: 'Upsell 2', description: 'Second upsell offer page' },
  { key: 'upsell3', label: 'Upsell 3', description: 'Third upsell offer page' },
  { key: 'thankyou', label: 'Thank You', description: 'Order confirmation page' },
];

export default function TrackingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // UTM mapping state
  const [utmMappings, setUtmMappings] = useState<Record<string, string>>({
    utm_source: 'source',
    utm_medium: 'medium',
    utm_campaign: 'campaign_name',
    utm_content: 'ad_name',
    utm_term: 'keyword',
  });

  // Attribution state
  const [clickWindow, setClickWindow] = useState('28');
  const [viewWindow, setViewWindow] = useState('1');
  const [attributionModel, setAttributionModel] = useState('last_click');

  // Multi-pixel state
  const [pixelConfigs, setPixelConfigs] = useState<Record<string, PixelConfig>>({});
  const [expandedPage, setExpandedPage] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [s, configs] = await Promise.all([fetchSettings(), fetchPixelConfigs()]);

      // Load UTM mappings from settings
      for (const param of UTM_PARAMS) {
        const settingKey = `tracking_${param.key}_mapping`;
        if (s[settingKey]) {
          setUtmMappings((prev) => ({ ...prev, [param.key]: s[settingKey] }));
        }
      }

      // Load attribution settings
      if (s.tracking_click_window) setClickWindow(s.tracking_click_window);
      if (s.tracking_view_window) setViewWindow(s.tracking_view_window);
      if (s.tracking_attribution_model) setAttributionModel(s.tracking_attribution_model);

      // Load pixel configs into map by funnel_page
      const configMap: Record<string, PixelConfig> = {};
      for (const c of configs) {
        configMap[c.funnel_page] = c;
      }
      setPixelConfigs(configMap);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data: Record<string, string> = {};

      // UTM mappings
      for (const param of UTM_PARAMS) {
        data[`tracking_${param.key}_mapping`] = utmMappings[param.key] || '';
      }

      // Attribution
      data.tracking_click_window = clickWindow;
      data.tracking_view_window = viewWindow;
      data.tracking_attribution_model = attributionModel;

      await updateSettings(data);
      setMessage({ type: 'success', text: 'Tracking settings saved successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePixel = async (funnelPage: string) => {
    const config = pixelConfigs[funnelPage];
    if (!config) return;
    try {
      const saved = await savePixelConfig(config);
      setPixelConfigs((prev) => ({ ...prev, [funnelPage]: saved }));
      setMessage({ type: 'success', text: `Pixel config saved for ${funnelPage}` });
    } catch {
      setMessage({ type: 'error', text: `Failed to save pixel config for ${funnelPage}` });
    }
  };

  const updatePixelConfig = (funnelPage: string, updates: Partial<PixelConfig>) => {
    setPixelConfigs((prev) => ({
      ...prev,
      [funnelPage]: {
        ...prev[funnelPage] || {
          id: 0,
          user_id: 0,
          name: `${funnelPage} pixel`,
          funnel_page: funnelPage,
          pixel_type: 'javascript',
          enabled: true,
          track_pageviews: true,
          track_conversions: true,
          track_upsells: false,
          custom_code: null,
          created_at: '',
          updated_at: '',
        },
        ...updates,
      } as PixelConfig,
    }));
  };

  const updateUtmMapping = (key: string, value: string) => {
    setUtmMappings((prev) => ({ ...prev, [key]: value }));
  };

  const generateSnippet = (funnelPage: string): string => {
    const config = pixelConfigs[funnelPage];
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';

    if (!config || !config.enabled) {
      return '<!-- Pixel disabled for this page -->';
    }

    if (config.pixel_type === 'image') {
      return `<!-- OpticData Pixel \u2014 ${funnelPage} -->
<noscript>
  <img src="${domain}/api/tracking/pixel.gif?t=pageview&page=${funnelPage}" width="1" height="1" alt="" style="display:none" />
</noscript>`;
    }

    const events: string[] = [];
    if (config.track_pageviews) events.push("'pageview'");
    if (config.track_conversions) events.push("'conversion'");
    if (config.track_upsells) events.push("'upsell'");

    let snippet = `<!-- OpticData Pixel \u2014 ${funnelPage} -->
<script>
(function(o,d,t){
  o._odt=o._odt||[];
  var s=d.createElement('script');
  s.async=true;
  s.src=t+'/tracking/pixel.js';
  d.head.appendChild(s);
  o._odt.push(['init',{
    domain:'${domain}',
    page:'${funnelPage}',
    events:[${events.join(',')}]
  }]);
})(window,document,'${domain}');
</script>`;

    if (config.custom_code) {
      snippet += `\n${config.custom_code}`;
    }

    return snippet;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setMessage({ type: 'success', text: 'Copied to clipboard' });
      setTimeout(() => setMessage(null), 2000);
    }).catch(() => {});
  };

  const inputCls = "w-full px-3 py-2.5 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent transition-colors";
  const selectCls = `${inputCls} appearance-none`;
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";
  const sectionCls = "bg-ats-card rounded-xl border border-ats-border p-5 mb-5";

  return (
    <PageShell
      title="Tracking Settings"
      subtitle="Configure UTM mapping, attribution windows, and tracking pixels"
      actions={
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-ats-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      }
    >
      {/* Message */}
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-5 text-ats-red text-sm">{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Attribution Naming Requirement */}
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-4">
            <h3 className="text-sm font-bold text-amber-300 mb-1">Important: Ad Set Naming &amp; Attribution</h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              For attribution to work, your Facebook <strong>Ad Set Name</strong> must exactly match the <strong>utm_campaign</strong> value sent with orders.
              For example, if your ad set is named <code className="bg-amber-900/50 px-1 rounded">Summer_Promo_2024</code>, orders must arrive with
              <code className="bg-amber-900/50 px-1 rounded">utm_campaign=Summer_Promo_2024</code>. Mismatched names will show as &ldquo;Unattributed&rdquo; in your dashboard.
              Use consistent naming conventions (no extra spaces, same capitalization) across your ad platform and checkout URLs.
            </p>
          </div>

          {/* UTM Parameter Mapping */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-ats-text mb-1">UTM Parameter Mapping</h3>
            <p className="text-xs text-ats-text-muted mb-4">Map incoming UTM parameters to internal data fields for attribution tracking.</p>

            <div className="space-y-3">
              {UTM_PARAMS.map((param) => (
                <div key={param.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div>
                    <label className={labelCls}>{param.label}</label>
                    <div className="text-xs text-ats-text-muted">{param.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ats-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="text-xs font-mono text-ats-text-muted">maps to</span>
                  </div>
                  <div>
                    <select
                      value={utmMappings[param.key] || ''}
                      onChange={(e) => updateUtmMapping(param.key, e.target.value)}
                      className={selectCls}
                    >
                      <option value="">-- Unmapped --</option>
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attribution Window Settings */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-ats-text mb-1">Attribution Settings</h3>
            <p className="text-xs text-ats-text-muted mb-4">Configure how conversions are attributed to ad interactions.</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelCls}>Click Attribution Window</label>
                <select
                  value={clickWindow}
                  onChange={(e) => setClickWindow(e.target.value)}
                  className={selectCls}
                >
                  {ATTRIBUTION_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
                <div className="text-[10px] text-ats-text-muted mt-1">How long after a click should a conversion be attributed</div>
              </div>
              <div>
                <label className={labelCls}>View-Through Window</label>
                <select
                  value={viewWindow}
                  onChange={(e) => setViewWindow(e.target.value)}
                  className={selectCls}
                >
                  {ATTRIBUTION_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
                <div className="text-[10px] text-ats-text-muted mt-1">How long after an impression (no click) should a conversion be attributed</div>
              </div>
              <div>
                <label className={labelCls}>Attribution Model</label>
                <select
                  value={attributionModel}
                  onChange={(e) => setAttributionModel(e.target.value)}
                  className={selectCls}
                >
                  {ATTRIBUTION_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model description */}
            <div className="bg-ats-bg rounded-lg p-3 border border-ats-border">
              <div className="text-[11px] text-ats-text-muted uppercase tracking-wide mb-1">
                {ATTRIBUTION_MODELS.find((m) => m.value === attributionModel)?.label || 'Unknown'} Model
              </div>
              <div className="text-xs text-ats-text">
                {ATTRIBUTION_MODELS.find((m) => m.value === attributionModel)?.description || ''}
              </div>
            </div>
          </div>

          {/* Multi-Pixel Funnel Page Manager */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-ats-text mb-1">Funnel Page Pixels</h3>
            <p className="text-xs text-ats-text-muted mb-4">Configure a separate tracking pixel for each page in your checkout funnel. Each page gets its own snippet with customized tracking events.</p>

            <div className="space-y-3">
              {FUNNEL_PAGES.map((page) => {
                const config = pixelConfigs[page.key];
                const isExpanded = expandedPage === page.key;
                const isEnabled = config?.enabled ?? false;

                return (
                  <div key={page.key} className={`rounded-lg border ${isEnabled ? 'border-ats-border' : 'border-ats-border'} bg-ats-bg overflow-hidden`}>
                    {/* Header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-ats-hover/50 transition-colors"
                      onClick={() => setExpandedPage(isExpanded ? null : page.key)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-ats-green' : 'bg-ats-border'}`} />
                        <div>
                          <span className="text-sm font-semibold text-ats-text">{page.label}</span>
                          <span className="text-xs text-ats-text-muted ml-2">{page.description}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEnabled && (
                          <span className="text-[10px] text-ats-text-muted bg-ats-bg px-2 py-0.5 rounded border border-ats-border">
                            {config?.pixel_type || 'javascript'}
                          </span>
                        )}
                        <span className="text-ats-text-muted text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                      </div>
                    </div>

                    {/* Expanded config */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-ats-border">
                        <div className="pt-3 space-y-3">
                          {/* Enable toggle + name */}
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => updatePixelConfig(page.key, {
                                  enabled: e.target.checked,
                                  funnel_page: page.key,
                                  name: config?.name || `${page.label} pixel`,
                                })}
                                className="w-4 h-4 rounded border-ats-border bg-ats-bg text-ats-accent focus:ring-ats-accent"
                              />
                              <span className="text-sm text-ats-text">Enabled</span>
                            </label>
                          </div>

                          {isEnabled && (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={labelCls}>Name</label>
                                  <input
                                    type="text"
                                    value={config?.name || ''}
                                    onChange={(e) => updatePixelConfig(page.key, { name: e.target.value })}
                                    className={inputCls}
                                    placeholder={`${page.label} pixel`}
                                  />
                                </div>
                                <div>
                                  <label className={labelCls}>Pixel Type</label>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => updatePixelConfig(page.key, { pixel_type: 'javascript' })}
                                      className={`flex-1 px-3 py-2 rounded-md text-xs font-mono transition-colors ${
                                        (config?.pixel_type || 'javascript') === 'javascript'
                                          ? 'bg-ats-accent text-white'
                                          : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:bg-ats-hover'
                                      }`}
                                    >
                                      JavaScript
                                    </button>
                                    <button
                                      onClick={() => updatePixelConfig(page.key, { pixel_type: 'image' })}
                                      className={`flex-1 px-3 py-2 rounded-md text-xs font-mono transition-colors ${
                                        config?.pixel_type === 'image'
                                          ? 'bg-ats-accent text-white'
                                          : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:bg-ats-hover'
                                      }`}
                                    >
                                      Image
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Event toggles */}
                              <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={config?.track_pageviews !== false}
                                    onChange={(e) => updatePixelConfig(page.key, { track_pageviews: e.target.checked })}
                                    className="w-4 h-4 rounded border-ats-border bg-ats-bg text-ats-accent focus:ring-ats-accent"
                                  />
                                  <span className="text-xs text-ats-text">Pageviews</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={config?.track_conversions !== false}
                                    onChange={(e) => updatePixelConfig(page.key, { track_conversions: e.target.checked })}
                                    className="w-4 h-4 rounded border-ats-border bg-ats-bg text-ats-accent focus:ring-ats-accent"
                                  />
                                  <span className="text-xs text-ats-text">Conversions</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={config?.track_upsells || false}
                                    onChange={(e) => updatePixelConfig(page.key, { track_upsells: e.target.checked })}
                                    className="w-4 h-4 rounded border-ats-border bg-ats-bg text-ats-accent focus:ring-ats-accent"
                                  />
                                  <span className="text-xs text-ats-text">Upsells</span>
                                </label>
                              </div>

                              {/* Custom code */}
                              <div>
                                <label className={labelCls}>Custom Code (optional)</label>
                                <textarea
                                  value={config?.custom_code || ''}
                                  onChange={(e) => updatePixelConfig(page.key, { custom_code: e.target.value || null })}
                                  className={`${inputCls} h-16 resize-y`}
                                  placeholder="Additional tracking code appended to the snippet..."
                                />
                              </div>

                              {/* Snippet preview */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className={labelCls}>Generated Snippet</label>
                                  <button
                                    onClick={() => copyToClipboard(generateSnippet(page.key))}
                                    className="text-xs text-ats-accent hover:text-blue-400 transition-colors"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <pre className="bg-ats-bg border border-ats-border rounded-lg p-3 text-xs font-mono text-ats-text overflow-x-auto whitespace-pre leading-relaxed max-h-48">
                                  {generateSnippet(page.key)}
                                </pre>
                              </div>

                              {/* Save button */}
                              <button
                                onClick={() => handleSavePixel(page.key)}
                                className="px-4 py-2 bg-ats-accent text-white rounded-md text-xs font-semibold hover:bg-blue-600 transition-colors"
                              >
                                Save {page.label} Pixel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save button (bottom) */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save All Tracking Settings'}
          </button>
        </>
      )}
    </PageShell>
  );
}
