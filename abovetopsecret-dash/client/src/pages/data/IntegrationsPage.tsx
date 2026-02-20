import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

interface Integration {
  key: string;
  name: string;
  description: string;
  icon: string;
  settingsKeys: string[];
  statusLabel: (settings: Record<string, string>) => 'connected' | 'partial' | 'disconnected';
  lastSyncKey?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    key: 'facebook',
    name: 'Meta Ads',
    description: 'Import ad campaign data, spend, impressions, clicks, and conversion metrics from Meta Ads Manager.',
    icon: 'f',
    settingsKeys: ['fb_access_token', 'fb_ad_account_ids'],
    statusLabel: (s) => {
      if (s.fb_access_token && s.fb_ad_account_ids) return 'connected';
      if (s.fb_access_token || s.fb_ad_account_ids) return 'partial';
      return 'disconnected';
    },
    lastSyncKey: 'fb_last_sync',
  },
  {
    key: 'checkoutchamp',
    name: 'CheckoutChamp',
    description: 'Sync order data, subscription metrics, take rates, and upsell performance from your CheckoutChamp account.',
    icon: 'C',
    settingsKeys: ['cc_api_key', 'cc_api_url'],
    statusLabel: (s) => {
      if (s.cc_api_key && s.cc_api_url) return 'connected';
      if (s.cc_api_key || s.cc_api_url) return 'partial';
      return 'disconnected';
    },
    lastSyncKey: 'cc_last_sync',
  },
  {
    key: 'shopify',
    name: 'Shopify',
    description: 'Receive real-time order and refund webhooks from your Shopify store for revenue tracking.',
    icon: 'S',
    settingsKeys: ['shopify_webhook_secret'],
    statusLabel: (s) => {
      if (s.shopify_webhook_secret) return 'connected';
      return 'disconnected';
    },
    lastSyncKey: 'shopify_last_sync',
  },
];

function getStatusConfig(status: 'connected' | 'partial' | 'disconnected') {
  switch (status) {
    case 'connected':
      return {
        dot: 'bg-ats-green',
        badge: 'bg-emerald-900/50 text-emerald-300',
        label: 'Connected',
        border: 'border-emerald-800/30',
      };
    case 'partial':
      return {
        dot: 'bg-ats-yellow',
        badge: 'bg-yellow-900/50 text-yellow-300',
        label: 'Partial Setup',
        border: 'border-yellow-800/30',
      };
    case 'disconnected':
      return {
        dot: 'bg-ats-red',
        badge: 'bg-red-900/50 text-red-300',
        label: 'Disconnected',
        border: 'border-red-800/30',
      };
  }
}

function formatSyncTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

function getIconBg(key: string): string {
  switch (key) {
    case 'facebook': return 'bg-blue-900/60 text-blue-300';
    case 'checkoutchamp': return 'bg-purple-900/60 text-purple-300';
    case 'shopify': return 'bg-green-900/60 text-green-300';
    default: return 'bg-gray-900/60 text-gray-300';
  }
}

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const connectedCount = INTEGRATIONS.filter((i) => i.statusLabel(settings) === 'connected').length;

  if (loading) {
    return (
      <PageShell title="Integrations" subtitle="Data source connections overview">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
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
          className="bg-ats-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          Manage Connections
        </button>
      }
    >
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
            {['connected', 'partial', 'disconnected'].map((status) => {
              const count = INTEGRATIONS.filter((i) => i.statusLabel(settings) === status).length;
              if (count === 0) return null;
              const config = getStatusConfig(status as 'connected' | 'partial' | 'disconnected');
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className="text-xs text-ats-text-muted font-mono">{count} {config.label.toLowerCase()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
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
          const status = integration.statusLabel(settings);
          const config = getStatusConfig(status);
          const lastSync = integration.lastSyncKey ? settings[integration.lastSyncKey] : undefined;

          return (
            <div
              key={integration.key}
              className={`bg-ats-card rounded-xl border ${config.border} p-5 flex flex-col`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${getIconBg(integration.key)}`}>
                  {integration.icon}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${config.badge}`}>
                  {config.label}
                </span>
              </div>

              {/* Name & Description */}
              <h3 className="text-sm font-semibold text-ats-text mb-1">{integration.name}</h3>
              <p className="text-xs text-ats-text-muted leading-relaxed flex-1">{integration.description}</p>

              {/* Status Details */}
              <div className="mt-4 pt-3 border-t border-ats-border space-y-2">
                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className="text-xs text-ats-text-muted">Status:</span>
                  <span className={`text-xs font-medium ${
                    status === 'connected' ? 'text-ats-green' : status === 'partial' ? 'text-ats-yellow' : 'text-ats-red'
                  }`}>
                    {config.label}
                  </span>
                </div>

                {/* Last Sync */}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-transparent" />
                  <span className="text-xs text-ats-text-muted">Last sync:</span>
                  <span className="text-xs text-ats-text font-mono">{formatSyncTime(lastSync)}</span>
                </div>

                {/* Configured fields indicator */}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-transparent" />
                  <span className="text-xs text-ats-text-muted">Config:</span>
                  <div className="flex gap-1">
                    {integration.settingsKeys.map((sk) => (
                      <span
                        key={sk}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                          settings[sk]
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : 'bg-[#374151] text-ats-text-muted'
                        }`}
                      >
                        {sk.replace(/^(fb_|cc_|shopify_)/, '').replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => navigate('/settings/connections')}
                className={`mt-4 w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                  status === 'connected'
                    ? 'bg-ats-border text-ats-text-muted hover:bg-ats-hover'
                    : 'bg-ats-accent text-white hover:bg-blue-600'
                }`}
              >
                {status === 'connected' ? 'Manage' : status === 'partial' ? 'Complete Setup' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Quick Info */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mt-6">
        <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wider mb-2">Integration Guide</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h5 className="text-xs font-medium text-ats-text mb-1">Meta Ads</h5>
            <p className="text-[11px] text-ats-text-muted leading-relaxed">
              Requires a valid access token and ad account IDs. Data syncs automatically via the scheduled job.
            </p>
          </div>
          <div>
            <h5 className="text-xs font-medium text-ats-text mb-1">CheckoutChamp</h5>
            <p className="text-[11px] text-ats-text-muted leading-relaxed">
              Provide your API key and base URL. Supports both API polling and real-time webhooks.
            </p>
          </div>
          <div>
            <h5 className="text-xs font-medium text-ats-text mb-1">Shopify</h5>
            <p className="text-[11px] text-ats-text-muted leading-relaxed">
              Configure your webhook secret and register the provided webhook URL in your Shopify admin.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center pt-4 pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {connectedCount}/{INTEGRATIONS.length} connected · data syncs run on schedule
        </div>
      </div>
    </PageShell>
  );
}
