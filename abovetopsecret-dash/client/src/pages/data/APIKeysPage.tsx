import { useState, useEffect, useCallback } from 'react';
import { fetchApiKeys, generateApiKey, revokeApiKey, ApiKey } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

export default function APIKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await fetchApiKeys();
      setKeys(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleGenerate = async () => {
    if (!keyName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name for the API key' });
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const result = await generateApiKey(keyName);
      setNewKey(result.key);
      setKeyName('');
      loadKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setMessage({ type: 'success', text: 'API key revoked' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const copyToClipboard = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = newKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  return (
    <PageShell
      title="API Keys"
      subtitle="Manage programmatic access to your data"
      actions={
        <button
          onClick={() => {
            setShowGenerate(true);
            setNewKey(null);
          }}
          className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          + Generate Key
        </button>
      }
    >
      {message && (
        <div
          className={`px-3 py-2 mb-4 rounded-md text-sm ${
            message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 mb-4 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      )}

      {/* Generate Key Modal */}
      {showGenerate && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'var(--overlay-bg)' }}>
          <div className="bg-ats-card border border-ats-border rounded-xl p-6 w-full max-w-md">
            {newKey ? (
              <>
                <h3 className="text-sm font-bold text-ats-text mb-3">API Key Generated</h3>
                <p className="text-xs text-ats-text-muted mb-3">
                  Copy this key now. It will not be shown again.
                </p>
                <div className="bg-ats-bg border border-ats-border rounded-lg p-3 mb-4 flex items-center gap-2">
                  <code className="text-sm text-ats-green font-mono flex-1 break-all">{newKey}</code>
                  <button
                    onClick={copyToClipboard}
                    className="shrink-0 px-3 py-1.5 bg-ats-accent text-white rounded text-xs font-semibold hover:bg-blue-600 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowGenerate(false);
                    setNewKey(null);
                  }}
                  className="w-full py-2 bg-ats-bg border border-ats-border text-ats-text rounded-lg text-sm hover:bg-ats-hover transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-ats-text mb-3">Generate API Key</h3>
                <div className="mb-4">
                  <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                    Key Name
                  </label>
                  <input
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. Production, CI/CD, Reporting"
                    className="w-full px-3 py-2 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent"
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex-1 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                  >
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-ats-card border border-ats-border rounded-lg overflow-hidden mb-6">
        {keys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-ats-text-muted mb-4">No API keys generated yet.</p>
            <button
              onClick={() => setShowGenerate(true)}
              className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              Generate Your First Key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ats-border text-ats-text-muted">
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Key Prefix</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Last Used</th>
                  <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-ats-border/50 hover:bg-ats-hover">
                    <td className="px-4 py-3 text-ats-text font-semibold">{key.name}</td>
                    <td className="px-4 py-3 text-ats-text-muted font-mono">{key.key_prefix}...</td>
                    <td className="px-4 py-3 text-ats-text-muted text-xs">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-ats-text-muted text-xs">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-xs text-ats-red hover:text-red-400 transition-colors"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Documentation */}
      <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
        <h3 className="text-sm font-bold text-ats-text mb-4">API Usage</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-2">
              Authentication
            </h4>
            <p className="text-xs text-ats-text-muted mb-2">
              Include your API key in the Authorization header of every request:
            </p>
            <div className="bg-ats-bg border border-ats-border rounded-lg p-3">
              <code className="text-xs text-ats-green font-mono">
                Authorization: Bearer {'<your-api-key>'}
              </code>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-2">
              Available Endpoints
            </h4>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/api/metrics', desc: 'Fetch all metric rows' },
                { method: 'GET', path: '/api/metrics/summary', desc: 'Aggregated totals' },
                { method: 'GET', path: '/api/analytics/timeseries?period=7d', desc: 'Time series data' },
                { method: 'GET', path: '/api/analytics/breakdown?by=campaign', desc: 'Breakdown by dimension' },
                { method: 'POST', path: '/api/sql/execute', desc: 'Execute SQL query' },
                { method: 'GET', path: '/api/export/csv', desc: 'Export metrics as CSV' },
              ].map((ep) => (
                <div key={ep.path} className="flex items-center gap-3 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                      ep.method === 'GET' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-blue-900/50 text-blue-300'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <code className="text-ats-text font-mono">{ep.path}</code>
                  <span className="text-ats-text-muted">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-2">
              Example Request
            </h4>
            <div className="bg-ats-bg border border-ats-border rounded-lg p-3">
              <pre className="text-xs text-ats-text font-mono whitespace-pre-wrap">{`curl -H "Authorization: Bearer <your-api-key>" \\
  https://your-domain.com/api/metrics/summary`}</pre>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
