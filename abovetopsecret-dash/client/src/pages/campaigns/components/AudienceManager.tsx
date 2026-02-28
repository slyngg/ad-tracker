import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  Users,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchNewsBreakAudiences,
  createNBCustomAudience,
  uploadNBAudienceData,
  createNBLookalikeAudience,
  deleteNBAudience,
} from '../../../lib/api';
import type { Account, NewsBreakAudience } from '../types';

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs text-ats-text-muted mb-1.5 font-medium">
      {children}{required && <span className="text-ats-red ml-0.5">*</span>}
    </label>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="text-[10px] text-ats-text-muted/60 mt-1">{children}</p>;
}

export default function AudienceManager({ onClose, accounts }: {
  onClose: () => void;
  accounts: Account[];
}) {
  const [audiences, setAudiences] = useState<NewsBreakAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'lookalike'>('list');
  // Create custom audience
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [idType, setIdType] = useState<'EMAIL' | 'PHONE' | 'DEVICE_ID'>('EMAIL');
  const [csvText, setCsvText] = useState('');
  const [creating, setCreating] = useState(false);
  // Lookalike
  const [sourceId, setSourceId] = useState('');
  const [lalName, setLalName] = useState('');
  const [lalRatio, setLalRatio] = useState('5');
  const [creatingLal, setCreatingLal] = useState(false);
  // Shared
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const inputCls = "w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent";

  async function loadAudiences() {
    setLoading(true);
    try {
      const data = await fetchNewsBreakAudiences();
      setAudiences(data);
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAudiences(); }, []);

  function parseIds(text: string): string[] {
    return text
      .split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }

  async function handleCreateAndUpload() {
    if (!newName.trim()) { setError('Audience name is required'); return; }
    const ids = parseIds(csvText);
    if (ids.length === 0) { setError('Paste at least one identifier (email, phone, or device ID)'); return; }

    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const { audience_id } = await createNBCustomAudience(newName.trim(), newDesc.trim() || undefined);
      await uploadNBAudienceData(audience_id, idType, ids);
      setSuccess(`Audience "${newName}" created with ${ids.length} identifiers. ID: ${audience_id}`);
      setNewName('');
      setNewDesc('');
      setCsvText('');
      loadAudiences();
    } catch (err: any) {
      setError(err.message || 'Failed to create audience');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateLookalike() {
    if (!sourceId) { setError('Select a source audience'); return; }
    if (!lalName.trim()) { setError('Lookalike audience name is required'); return; }

    setCreatingLal(true);
    setError('');
    setSuccess('');
    try {
      const { audience_id } = await createNBLookalikeAudience(sourceId, lalName.trim(), parseInt(lalRatio) || 5);
      setSuccess(`Lookalike "${lalName}" created. ID: ${audience_id}`);
      setLalName('');
      setSourceId('');
      loadAudiences();
    } catch (err: any) {
      setError(err.message || 'Failed to create lookalike');
    } finally {
      setCreatingLal(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete audience "${name}"?`)) return;
    try {
      await deleteNBAudience(id);
      setAudiences(prev => prev.filter(a => a.audience_id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || '');
    };
    reader.readAsText(file);
  }

  const customAudiences = audiences.filter(a => a.audience_type === 'CUSTOM' || !a.source_audience_id);

  const tabs = [
    { key: 'list' as const, label: 'Audiences', icon: Users },
    { key: 'create' as const, label: 'Custom', icon: Upload },
    { key: 'lookalike' as const, label: 'Lookalike', icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ats-bg border border-ats-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ats-border">
          <div>
            <h2 className="text-base font-bold text-ats-text">NewsBreak Audiences</h2>
            <p className="text-xs text-ats-text-muted mt-0.5">Create custom & lookalike audiences for targeting</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ats-border">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(''); setSuccess(''); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t.key ? 'border-ats-accent text-ats-accent' : 'border-transparent text-ats-text-muted hover:text-ats-text'}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Status messages */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs bg-red-900/40 text-red-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs bg-emerald-900/40 text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {success}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* List tab */}
          {tab === 'list' && (
            <>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-14 bg-ats-card rounded-lg animate-pulse" />)}
                </div>
              ) : audiences.length === 0 ? (
                <div className="text-center py-10 text-sm text-ats-text-muted">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No audiences yet.</p>
                  <p className="text-xs mt-1">Create a custom audience to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {audiences.map(a => (
                    <div key={a.audience_id} className="bg-ats-card border border-ats-border rounded-lg px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ats-text truncate">{a.audience_name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.audience_type === 'LOOKALIKE' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {a.audience_type}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.status === 'READY' || a.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {a.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-ats-text-muted">
                          <span>ID: {a.audience_id}</span>
                          {a.size != null && <span>Size: {a.size.toLocaleString()}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDelete(a.audience_id, a.audience_name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-ats-text-muted hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={loadAudiences} disabled={loading} className="text-xs text-ats-accent hover:underline">
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          )}

          {/* Create Custom Audience tab */}
          {tab === 'create' && (
            <div className="space-y-4">
              <div>
                <Label required>Audience Name</Label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Purchasers Q1 2026" className={inputCls} />
              </div>
              <div>
                <Label>Description</Label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" className={inputCls} />
              </div>
              <div>
                <Label required>Identifier Type</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {(['EMAIL', 'PHONE', 'DEVICE_ID'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setIdType(t)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${idType === t ? 'bg-ats-accent/15 border-ats-accent text-ats-accent' : 'bg-ats-card border-ats-border text-ats-text-muted hover:border-ats-text-muted'}`}
                    >
                      {t === 'EMAIL' ? 'Email' : t === 'PHONE' ? 'Phone' : 'Device ID'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label required>Identifiers</Label>
                <textarea
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  rows={6}
                  placeholder={idType === 'EMAIL' ? 'john@example.com\njane@example.com\n...' : idType === 'PHONE' ? '+15551234567\n+15559876543\n...' : 'device-id-1\ndevice-id-2\n...'}
                  className={inputCls + ' resize-none font-mono text-xs'}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <Hint>{`${parseIds(csvText).length} identifiers detected (one per line, or comma-separated)`}</Hint>
                  <label className="text-[10px] text-ats-accent cursor-pointer hover:underline">
                    Upload CSV
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
              <button
                onClick={handleCreateAndUpload}
                disabled={creating || !newName.trim() || parseIds(csvText).length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {creating ? 'Creating...' : 'Create & Upload Audience'}
              </button>
            </div>
          )}

          {/* Lookalike tab */}
          {tab === 'lookalike' && (
            <div className="space-y-4">
              <div className="bg-ats-card border border-ats-border rounded-lg p-3">
                <p className="text-xs text-ats-text-muted">
                  Create a lookalike audience from an existing custom audience. NewsBreak will find users similar to your source audience — e.g. people who look like your buyers.
                </p>
              </div>
              <div>
                <Label required>Source Audience</Label>
                {customAudiences.length === 0 ? (
                  <p className="text-xs text-ats-text-muted">No custom audiences available. Create one first.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select a source audience...</option>
                    {customAudiences.map(a => (
                      <option key={a.audience_id} value={a.audience_id}>
                        {a.audience_name} ({a.size?.toLocaleString() || '?'} users)
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <Label required>Lookalike Audience Name</Label>
                <input
                  value={lalName}
                  onChange={e => setLalName(e.target.value)}
                  placeholder="e.g. Purchasers - Lookalike 5%"
                  className={inputCls}
                />
              </div>
              <div>
                <Label>Lookalike Ratio (%)</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1" max="10" step="1"
                    value={lalRatio}
                    onChange={e => setLalRatio(e.target.value)}
                    className="flex-1 accent-ats-accent"
                  />
                  <span className="text-sm font-mono text-ats-text w-8 text-right">{lalRatio}%</span>
                </div>
                <Hint>Lower % = more similar to source. Higher % = larger reach.</Hint>
              </div>
              <button
                onClick={handleCreateLookalike}
                disabled={creatingLal || !sourceId || !lalName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {creatingLal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {creatingLal ? 'Creating...' : 'Create Lookalike Audience'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
