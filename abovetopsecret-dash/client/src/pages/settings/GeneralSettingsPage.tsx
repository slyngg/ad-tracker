import { useState, useEffect, useCallback } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { fetchSettings, updateSettings } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';
import { useThemeStore, ThemeMode } from '../../stores/themeStore';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Monitor; desc: string }[] = [
  { value: 'system', label: 'System', icon: Monitor, desc: 'Match your device' },
  { value: 'light', label: 'Light', icon: Sun, desc: 'Always light' },
  { value: 'dark', label: 'Dark', icon: Moon, desc: 'Always dark' },
];

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [authToken, setAuthToken] = useState('');
  const [syncInterval, setSyncInterval] = useState('10');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { mode, setMode } = useThemeStore();

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setSyncInterval(s.sync_interval_minutes || '10');
    } catch {
      // Settings may not be available yet
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
      if (authToken) data.auth_token = authToken;
      if (syncInterval) data.sync_interval_minutes = syncInterval;

      const updated = await updateSettings(data);
      setSettings(updated);
      setAuthToken('');
      setMessage({ type: 'success', text: 'Dashboard settings saved' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";

  return (
    <PageShell title="General Settings" subtitle="Dashboard configuration">
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm`}
          style={{
            backgroundColor: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: message.type === 'success' ? 'var(--success-text)' : 'var(--error-text)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Appearance */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold text-ats-text mb-1">Appearance</h3>
        <p className="text-xs text-ats-text-muted mb-4">Choose how the dashboard looks to you</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-sm transition-colors ${
                  active
                    ? 'border-ats-accent bg-ats-accent/10 text-ats-accent'
                    : 'border-ats-border text-ats-text-secondary hover:bg-ats-hover hover:text-ats-text'
                }`}
              >
                <opt.icon size={20} />
                <span className="font-medium text-xs">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold text-ats-text mb-4">Authentication</h3>
        <div>
          <label className={labelCls}>Auth Token</label>
          <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)}
            placeholder={settings.auth_token || 'Change dashboard access token'} className={inputCls} />
          <div className="text-[11px] text-ats-text-muted mt-1">Leave blank to keep current token. Set to change.</div>
        </div>
      </div>

      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-6">
        <h3 className="text-sm font-bold text-ats-text mb-4">Sync Settings</h3>
        <div>
          <label className={labelCls}>Meta Ads Sync Interval (minutes)</label>
          <input type="number" min="1" max="60" value={syncInterval}
            onChange={(e) => setSyncInterval(e.target.value)} className={inputCls} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
        {saving ? 'Saving...' : 'Save Dashboard Settings'}
      </button>
    </PageShell>
  );
}
