import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, updateSettings } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [authToken, setAuthToken] = useState('');
  const [syncInterval, setSyncInterval] = useState('10');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const inputCls = "w-full px-4 py-3 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";

  return (
    <PageShell title="General Settings" subtitle="Dashboard configuration">
      {message && (
        <div className={`px-3 py-2 mb-4 rounded-md text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold text-ats-text mb-4">Authentication</h3>
        <div>
          <label className={labelCls}>Auth Token</label>
          <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)}
            placeholder={settings.auth_token || 'Change dashboard access token'} className={inputCls} />
          <div className="text-[11px] text-[#4b5563] mt-1">Leave blank to keep current token. Set to change.</div>
        </div>
      </div>

      <div className="bg-ats-surface border border-ats-border rounded-lg p-4 mb-6">
        <h3 className="text-sm font-bold text-ats-text mb-4">Sync Settings</h3>
        <div>
          <label className={labelCls}>Facebook Sync Interval (minutes)</label>
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
