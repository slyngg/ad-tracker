import { useState, useEffect, useCallback } from 'react';
import {
  fetchNotifications,
  fetchNotificationPreferences,
  saveNotificationPreferences,
  markNotificationRead,
  AppNotification,
  NotificationPref,
} from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

interface AlertConfig {
  eventType: string;
  label: string;
  description: string;
  hasThreshold: boolean;
  thresholdLabel?: string;
  thresholdUnit?: string;
  defaultThreshold?: number;
}

const ALERT_TYPES: AlertConfig[] = [
  {
    eventType: 'spend_threshold',
    label: 'Spend Threshold',
    description: 'Alert when daily spend exceeds a set amount',
    hasThreshold: true,
    thresholdLabel: 'Max Daily Spend',
    thresholdUnit: '$',
    defaultThreshold: 1000,
  },
  {
    eventType: 'roas_floor',
    label: 'ROAS Floor',
    description: 'Alert when ROAS drops below a minimum target',
    hasThreshold: true,
    thresholdLabel: 'Minimum ROAS',
    thresholdUnit: 'x',
    defaultThreshold: 1.5,
  },
  {
    eventType: 'zero_conversions',
    label: 'Zero Conversions',
    description: 'Alert when an offer has zero conversions for a period',
    hasThreshold: false,
  },
  {
    eventType: 'sync_failed',
    label: 'Sync Failed',
    description: 'Alert when a data source sync fails',
    hasThreshold: false,
  },
];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function notificationIcon(type: string): string {
  switch (type) {
    case 'spend_threshold': return 'S';
    case 'roas_floor': return 'R';
    case 'zero_conversions': return 'Z';
    case 'sync_failed': return 'X';
    default: return 'N';
  }
}

function notificationIconColor(type: string): string {
  switch (type) {
    case 'spend_threshold': return 'bg-yellow-900/50 text-yellow-300';
    case 'roas_floor': return 'bg-red-900/50 text-red-300';
    case 'zero_conversions': return 'bg-orange-900/50 text-orange-300';
    case 'sync_failed': return 'bg-red-900/50 text-red-300';
    default: return 'bg-blue-900/50 text-blue-300';
  }
}

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsData, notifData] = await Promise.all([
        fetchNotificationPreferences(),
        fetchNotifications(),
      ]);
      setPrefs(prefsData);
      setNotifications(notifData);

      // Initialize thresholds from saved prefs
      const th: Record<string, number> = {};
      prefsData.forEach((p) => {
        if (p.config?.threshold != null) {
          th[p.event_type] = p.config.threshold;
        }
      });
      // Fill defaults
      ALERT_TYPES.forEach((at) => {
        if (at.hasThreshold && th[at.eventType] == null) {
          th[at.eventType] = at.defaultThreshold || 0;
        }
      });
      setThresholds(th);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isPrefEnabled = (eventType: string): boolean => {
    const pref = prefs.find((p) => p.event_type === eventType);
    return pref?.enabled ?? false;
  };

  const togglePref = (eventType: string) => {
    setPrefs((prev) => {
      const existing = prev.find((p) => p.event_type === eventType);
      if (existing) {
        return prev.map((p) =>
          p.event_type === eventType ? { ...p, enabled: !p.enabled } : p
        );
      }
      return [...prev, { channel: 'in_app', event_type: eventType, enabled: true }];
    });
  };

  const updateThreshold = (eventType: string, value: number) => {
    setThresholds((prev) => ({ ...prev, [eventType]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const prefsToSave: NotificationPref[] = ALERT_TYPES.map((at) => {
        const existing = prefs.find((p) => p.event_type === at.eventType);
        const config = at.hasThreshold ? { threshold: thresholds[at.eventType] || at.defaultThreshold } : undefined;
        return {
          id: existing?.id,
          channel: 'in_app',
          event_type: at.eventType,
          enabled: isPrefEnabled(at.eventType),
          config,
        };
      });
      await saveNotificationPreferences(prefsToSave);
      setMessage({ type: 'success', text: 'Notification preferences saved' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch {
      // Silently fail for mark-read
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read_at);
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
    setNotifications((prev) =>
      prev.map((n) => (!n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const inputCls = "w-full px-3 py-2 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";

  if (loading) {
    return (
      <PageShell title="Notifications" subtitle="Alert preferences and notification history">
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Notifications" subtitle="Alert preferences and notification history">
        <div className="text-center py-10 text-ats-red text-sm">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Notifications"
      subtitle="Alert preferences and notification history"
      actions={
        <div className="flex items-center bg-ats-border rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-ats-accent text-white'
                : 'text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-medium transition-colors relative ${
              activeTab === 'history'
                ? 'bg-ats-accent text-white'
                : 'text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            History
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-ats-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      }
    >
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {activeTab === 'settings' && (
        <>
          {/* Alert Toggles */}
          <div className="space-y-3 mb-6">
            {ALERT_TYPES.map((alert) => {
              const enabled = isPrefEnabled(alert.eventType);
              return (
                <div key={alert.eventType} className="bg-ats-card rounded-xl border border-ats-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ats-text">{alert.label}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          enabled ? 'bg-emerald-900/50 text-emerald-300' : 'bg-[#374151] text-ats-text-muted'
                        }`}>
                          {enabled ? 'Active' : 'Off'}
                        </span>
                      </div>
                      <p className="text-xs text-ats-text-muted mt-0.5">{alert.description}</p>
                    </div>
                    <button
                      onClick={() => togglePref(alert.eventType)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        enabled ? 'bg-ats-accent' : 'bg-[#374151]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          enabled ? 'translate-x-5.5 left-0.5' : 'translate-x-0 left-0.5'
                        }`}
                        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>

                  {/* Threshold config */}
                  {alert.hasThreshold && enabled && (
                    <div className="mt-3 pt-3 border-t border-ats-border">
                      <label className="text-[11px] text-ats-text-muted uppercase tracking-wide block mb-1">
                        {alert.thresholdLabel}
                      </label>
                      <div className="flex items-center gap-2 max-w-xs">
                        {alert.thresholdUnit === '$' && (
                          <span className="text-ats-text-muted text-sm">$</span>
                        )}
                        <input
                          type="number"
                          step={alert.thresholdUnit === 'x' ? '0.1' : '1'}
                          value={thresholds[alert.eventType] ?? alert.defaultThreshold ?? 0}
                          onChange={(e) => updateThreshold(alert.eventType, parseFloat(e.target.value) || 0)}
                          className={inputCls}
                        />
                        {alert.thresholdUnit === 'x' && (
                          <span className="text-ats-text-muted text-sm">x</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </>
      )}

      {activeTab === 'history' && (
        <>
          {/* Header actions */}
          {unreadCount > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={handleMarkAllRead}
                className="px-3 py-1.5 text-xs text-ats-accent hover:text-blue-400 transition-colors"
              >
                Mark all as read ({unreadCount})
              </button>
            </div>
          )}

          {/* Notification list */}
          <div className="space-y-2">
            {notifications.length === 0 && (
              <div className="text-center py-10 text-ats-text-muted">
                <div className="text-base mb-2">No notifications yet</div>
                <div className="text-sm">Notifications will appear here when alerts are triggered.</div>
              </div>
            )}
            {notifications.map((notif) => {
              const isUnread = !notif.read_at;
              return (
                <div
                  key={notif.id}
                  className={`bg-ats-card rounded-xl border p-4 transition-colors ${
                    isUnread
                      ? 'border-ats-accent/30 bg-blue-950/20'
                      : 'border-ats-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${notificationIconColor(notif.type)}`}>
                      {notificationIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-medium ${isUnread ? 'text-ats-text' : 'text-ats-text-muted'}`}>
                          {notif.title}
                        </h4>
                        {isUnread && (
                          <span className="w-2 h-2 bg-ats-accent rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-ats-text-muted mt-0.5 line-clamp-2">{notif.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-ats-text-muted font-mono">
                          {timeAgo(notif.created_at)}
                        </span>
                        {isUnread && (
                          <button
                            onClick={() => handleMarkRead(notif.id)}
                            className="text-[10px] text-ats-accent hover:text-blue-400 transition-colors"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="text-center pt-4 pb-2">
        <div className="text-[10px] text-[#374151] font-mono">
          {ALERT_TYPES.filter((a) => isPrefEnabled(a.eventType)).length} alerts active
          {' · '}{notifications.length} notifications
          {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
        </div>
      </div>
    </PageShell>
  );
}
