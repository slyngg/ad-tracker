import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings, getOAuthStatus, disconnectOAuth, OAuthStatus } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';
import OAuthConnectButton from '../../components/shared/OAuthConnectButton';

interface Integration {
  key: string;
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  oauthPlatform?: string; // if set, shows OAuth button
  settingsKeys: string[];
  manualStatusLabel: (settings: Record<string, string>) => 'connected' | 'partial' | 'disconnected';
}

const INTEGRATIONS: Integration[] = [
  {
    key: 'facebook',
    name: 'Meta Ads',
    description: 'Import ad campaign data, spend, impressions, clicks, and conversion metrics from Meta Ads Manager.',
    icon: 'f',
    iconBg: 'bg-blue-900/60 text-blue-300',
    oauthPlatform: 'meta',
    settingsKeys: ['fb_access_token', 'fb_ad_account_ids'],
    manualStatusLabel: (s) => {
      if (s.fb_access_token && s.fb_ad_account_ids) return 'connected';
      if (s.fb_access_token || s.fb_ad_account_ids) return 'partial';
      return 'disconnected';
    },
  },
  {
    key: 'google',
    name: 'Google Analytics',
    description: 'GA4 traffic analytics, funnel analysis, site search queries, product journeys, and conversion data.',
    icon: 'G',
    iconBg: 'bg-red-900/60 text-red-300',
    oauthPlatform: 'google',
    settingsKeys: ['ga4_property_id'],
    manualStatusLabel: (s) => {
      if (s.ga4_property_id) return 'connected';
      return 'disconnected';
    },
  },
  {
    key: 'shopify',
    name: 'Shopify',
    description: 'Receive real-time order and refund webhooks from your Shopify store for revenue tracking.',
    icon: 'S',
    iconBg: 'bg-green-900/60 text-green-300',
    oauthPlatform: 'shopify',
    settingsKeys: ['shopify_webhook_secret'],
    manualStatusLabel: (s) => {
      if (s.shopify_webhook_secret) return 'connected';
      return 'disconnected';
    },
  },
  {
    key: 'tiktok',
    name: 'TikTok Ads',
    description: 'Connect TikTok Ads for campaign performance, spend, and conversion metrics.',
    icon: 'T',
    iconBg: 'bg-pink-900/60 text-pink-300',
    oauthPlatform: 'tiktok',
    settingsKeys: [],
    manualStatusLabel: () => 'disconnected',
  },
  {
    key: 'klaviyo',
    name: 'Klaviyo',
    description: 'Email marketing lists, profiles, campaign performance metrics, and customer insights.',
    icon: 'K',
    iconBg: 'bg-purple-900/60 text-purple-300',
    oauthPlatform: 'klaviyo',
    settingsKeys: [],
    manualStatusLabel: () => 'disconnected',
  },
  {
    key: 'checkoutchamp',
    name: 'CheckoutChamp',
    description: 'Sync order data, subscription metrics, take rates, and upsell performance from your CheckoutChamp account.',
    icon: 'C',
    iconBg: 'bg-purple-900/60 text-purple-300',
    settingsKeys: ['cc_api_key', 'cc_api_url'],
    manualStatusLabel: (s) => {
      if (s.cc_api_key && s.cc_api_url) return 'connected';
      if (s.cc_api_key || s.cc_api_url) return 'partial';
      return 'disconnected';
    },
  },
];

function getStatusConfig(status: 'connected' | 'partial' | 'disconnected') {
  switch (status) {
    case 'connected':
      return { dot: 'bg-ats-green', badge: 'bg-emerald-900/50 text-emerald-300', label: 'Connected', border: 'border-emerald-800/30' };
    case 'partial':
      return { dot: 'bg-ats-yellow', badge: 'bg-yellow-900/50 text-yellow-300', label: 'Partial Setup', border: 'border-yellow-800/30' };
    case 'disconnected':
      return { dot: 'bg-ats-red', badge: 'bg-red-900/50 text-red-300', label: 'Disconnected', border: 'border-red-800/30' };
  }
}

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, statuses] = await Promise.all([
        fetchSettings(),
        getOAuthStatus().catch(() => [] as OAuthStatus[]),
      ]);
      setSettings(settingsData);
      setOauthStatuses(statuses);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getEffectiveStatus = (integration: Integration): 'connected' | 'partial' | 'disconnected' => {
    // Check OAuth status first
    if (integration.oauthPlatform) {
      const oauth = oauthStatuses.find(s => s.platform === integration.oauthPlatform);
      if (oauth?.status === 'connected') return 'connected';
    }
    // Fall back to manual settings check
    return integration.manualStatusLabel(settings);
  };

  const getOAuthInfo = (platform?: string): OAuthStatus | undefined => {
    if (!platform) return undefined;
    return oauthStatuses.find(s => s.platform === platform);
  };

  const handleOAuthSuccess = () => {
    loadData();
    setMessage({ type: 'success', text: 'Connected successfully!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleOAuthError = (msg: string) => {
    setMessage({ type: 'error', text: msg });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm('Disconnect this integration? You can reconnect anytime.')) return;
    try {
      await disconnectOAuth(platform);
      await loadData();
      setMessage({ type: 'success', text: 'Disconnected' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const connectedCount = INTEGRATIONS.filter(i => getEffectiveStatus(i) === 'connected').length;

  if (loading) {
    return (
      <PageShell title="Integrations" subtitle="Data source connections overview">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Integrations" subtitle="Data source connections overview">
        <div className="text-center py-10 text-ats-red text-sm">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Integrations"
      subtitle="Data source connections overview"
      actions={
        <button
          onClick={() => navigate('/settings/connections')}
          className="bg-ats-border text-ats-text-muted px-4 py-2 rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors"
        >
          Advanced Settings
        </button>
      }
    >
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Summary Bar */}
      <div className="bg-ats-card rounded-xl border border-ats-border p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-ats-text font-semibold">Integration Status</div>
            <div className="text-xs text-ats-text-muted mt-0.5">
              {connectedCount} of {INTEGRATIONS.length} integrations connected
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(['connected', 'disconnected'] as const).map((status) => {
              const count = INTEGRATIONS.filter(i => getEffectiveStatus(i) === status).length;
              if (count === 0) return null;
              const config = getStatusConfig(status);
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className="text-xs text-ats-text-muted font-mono">{count} {config.label.toLowerCase()}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-ats-border rounded-full overflow-hidden">
          <div
            className="h-full bg-ats-green rounded-full transition-all duration-500"
            style={{ width: `${(connectedCount / INTEGRATIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map((integration) => {
          const status = getEffectiveStatus(integration);
          const config = getStatusConfig(status);
          const oauthInfo = getOAuthInfo(integration.oauthPlatform);
          const isOAuthConnected = oauthInfo?.status === 'connected' && oauthInfo.connectionMethod === 'oauth';

          return (
            <div key={integration.key} className={`bg-ats-card rounded-xl border ${config.border} p-5 flex flex-col`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${integration.iconBg}`}>
                  {integration.icon}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${config.badge}`}>
                  {config.label}
                </span>
              </div>

              {/* Name & Description */}
              <h3 className="text-sm font-semibold text-ats-text mb-1">{integration.name}</h3>
              <p className="text-xs text-ats-text-muted leading-relaxed flex-1">{integration.description}</p>

              {/* OAuth scopes / expiry when connected */}
              {isOAuthConnected && oauthInfo?.tokenExpiresAt && (
                <div className="mt-2 text-[10px] text-ats-text-muted font-mono">
                  Token expires: {new Date(oauthInfo.tokenExpiresAt).toLocaleDateString()}
                </div>
              )}

              {/* Action */}
              <div className="mt-4 pt-3 border-t border-ats-border">
                {status === 'connected' ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                      <span className="text-xs text-emerald-400 font-medium">
                        {isOAuthConnected ? 'Connected via OAuth' : 'Connected'}
                      </span>
                    </div>
                    {isOAuthConnected && integration.oauthPlatform && (
                      <button
                        onClick={() => handleDisconnect(integration.oauthPlatform!)}
                        className="text-[10px] text-ats-text-muted hover:text-ats-red transition-colors"
                      >
                        Disconnect
                      </button>
                    )}
                    <button
                      onClick={() => navigate('/settings/connections')}
                      className="text-[10px] text-ats-text-muted hover:text-ats-text transition-colors"
                    >
                      Settings
                    </button>
                  </div>
                ) : integration.oauthPlatform ? (
                  <div className="space-y-2">
                    <OAuthConnectButton
                      platform={integration.oauthPlatform}
                      onSuccess={handleOAuthSuccess}
                      onError={handleOAuthError}
                      className="w-full py-2.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                    />
                    <button
                      onClick={() => navigate('/settings/connections')}
                      className="w-full text-center text-[10px] text-ats-text-muted hover:text-ats-text transition-colors py-1"
                    >
                      Or configure manually
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate('/settings/connections')}
                    className="w-full py-2.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors"
                  >
                    Configure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center pt-4 pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {connectedCount}/{INTEGRATIONS.length} connected · data syncs run on schedule
        </div>
      </div>
    </PageShell>
  );
}
