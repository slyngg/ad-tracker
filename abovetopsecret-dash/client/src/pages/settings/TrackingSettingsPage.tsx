import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSettings, updateSettings } from '../../lib/api';
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
  'custom_1',
  'custom_2',
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

export default function TrackingSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
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

  // Pixel settings
  const [pixelDomain, setPixelDomain] = useState('');
  const [pixelType, setPixelType] = useState<'javascript' | 'image'>('javascript');
  const [trackPageviews, setTrackPageviews] = useState(true);
  const [trackConversions, setTrackConversions] = useState(true);
  const [trackUpsells, setTrackUpsells] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const s = await fetchSettings();
      setSettings(s);

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

      // Load pixel settings
      if (s.tracking_pixel_domain) setPixelDomain(s.tracking_pixel_domain);
      if (s.tracking_pixel_type) setPixelType(s.tracking_pixel_type as 'javascript' | 'image');
      if (s.tracking_pageviews !== undefined) setTrackPageviews(s.tracking_pageviews !== 'false');
      if (s.tracking_conversions !== undefined) setTrackConversions(s.tracking_conversions !== 'false');
      if (s.tracking_upsells !== undefined) setTrackUpsells(s.tracking_upsells !== 'false');

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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

      // Pixel
      if (pixelDomain) data.tracking_pixel_domain = pixelDomain;
      data.tracking_pixel_type = pixelType;
      data.tracking_pageviews = String(trackPageviews);
      data.tracking_conversions = String(trackConversions);
      data.tracking_upsells = String(trackUpsells);

      const updated = await updateSettings(data);
      setSettings(updated);
      setMessage({ type: 'success', text: 'Tracking settings saved successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateUtmMapping = (key: string, value: string) => {
    setUtmMappings((prev) => ({ ...prev, [key]: value }));
  };

  // Generate tracking pixel snippet
  const domain = pixelDomain || (typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com');

  const pixelSnippet = useMemo(() => {
    if (pixelType === 'javascript') {
      const events = [];
      if (trackPageviews) events.push("'pageview'");
      if (trackConversions) events.push("'conversion'");
      if (trackUpsells) events.push("'upsell'");

      return `<!-- OpticData Tracking Pixel -->
<script>
(function(o,d,t){
  o._odt=o._odt||[];
  var s=d.createElement('script');
  s.async=true;
  s.src=t+'/tracking/pixel.js';
  d.head.appendChild(s);
  o._odt.push(['init',{
    domain:'${domain}',
    events:[${events.join(',')}]
  }]);
})(window,document,'${domain}');
</script>
<!-- End OpticData Tracking Pixel -->`;
    }

    return `<!-- OpticData Tracking Pixel (Image) -->
<noscript>
  <img src="${domain}/api/tracking/pixel.gif?t=pageview&r=${encodeURIComponent('{{referrer}}')}&u=${encodeURIComponent('{{url}}')}" width="1" height="1" alt="" style="display:none" />
</noscript>
<!-- End OpticData Tracking Pixel -->`;
  }, [pixelType, domain, trackPageviews, trackConversions, trackUpsells]);

  const conversionSnippet = useMemo(() => {
    return `<!-- OpticData Conversion Tracking -->
<script>
  // Place this on your thank-you / order confirmation page
  window._odt = window._odt || [];
  window._odt.push(['track', 'conversion', {
    order_id: '{{ORDER_ID}}',
    revenue: {{REVENUE}},
    currency: 'USD',
    offer_name: '{{OFFER_NAME}}'
  }]);
</script>`;
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setMessage({ type: 'success', text: 'Copied to clipboard' });
      setTimeout(() => setMessage(null), 2000);
    }).catch(() => {});
  };

  const inputCls = "w-full px-3 py-2.5 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent transition-colors";
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

          {/* Tracking Pixel Generator */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-ats-text mb-1">Tracking Pixel</h3>
            <p className="text-xs text-ats-text-muted mb-4">Generate a tracking pixel snippet for your landing pages and checkout flow.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Tracking Domain</label>
                <input
                  type="text"
                  value={pixelDomain}
                  onChange={(e) => setPixelDomain(e.target.value)}
                  placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Pixel Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPixelType('javascript')}
                    className={`flex-1 px-3 py-2.5 rounded-md text-sm font-mono transition-colors ${
                      pixelType === 'javascript'
                        ? 'bg-ats-accent text-white'
                        : 'bg-ats-bg border border-[#374151] text-ats-text-muted hover:bg-ats-hover'
                    }`}
                  >
                    JavaScript
                  </button>
                  <button
                    onClick={() => setPixelType('image')}
                    className={`flex-1 px-3 py-2.5 rounded-md text-sm font-mono transition-colors ${
                      pixelType === 'image'
                        ? 'bg-ats-accent text-white'
                        : 'bg-ats-bg border border-[#374151] text-ats-text-muted hover:bg-ats-hover'
                    }`}
                  >
                    Image
                  </button>
                </div>
              </div>
            </div>

            {/* Event toggles */}
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackPageviews}
                  onChange={(e) => setTrackPageviews(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-ats-bg text-ats-accent focus:ring-ats-accent"
                />
                <span className="text-sm text-ats-text">Track Pageviews</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackConversions}
                  onChange={(e) => setTrackConversions(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-ats-bg text-ats-accent focus:ring-ats-accent"
                />
                <span className="text-sm text-ats-text">Track Conversions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackUpsells}
                  onChange={(e) => setTrackUpsells(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-ats-bg text-ats-accent focus:ring-ats-accent"
                />
                <span className="text-sm text-ats-text">Track Upsells</span>
              </label>
            </div>

            {/* Base pixel snippet */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Base Tracking Snippet</label>
                <button
                  onClick={() => copyToClipboard(pixelSnippet)}
                  className="text-xs text-ats-accent hover:text-blue-400 transition-colors"
                >
                  Copy
                </button>
              </div>
              <pre className="bg-ats-bg border border-[#374151] rounded-lg p-3 text-xs font-mono text-ats-text overflow-x-auto whitespace-pre leading-relaxed">
                {pixelSnippet}
              </pre>
              <div className="text-[10px] text-ats-text-muted mt-1">
                Place this snippet in the &lt;head&gt; section of every page you want to track.
              </div>
            </div>

            {/* Conversion snippet */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Conversion Tracking Snippet</label>
                <button
                  onClick={() => copyToClipboard(conversionSnippet)}
                  className="text-xs text-ats-accent hover:text-blue-400 transition-colors"
                >
                  Copy
                </button>
              </div>
              <pre className="bg-ats-bg border border-[#374151] rounded-lg p-3 text-xs font-mono text-ats-text overflow-x-auto whitespace-pre leading-relaxed">
                {conversionSnippet}
              </pre>
              <div className="text-[10px] text-ats-text-muted mt-1">
                Place this on your order confirmation / thank-you page. Replace placeholders with dynamic values from your order system.
              </div>
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
