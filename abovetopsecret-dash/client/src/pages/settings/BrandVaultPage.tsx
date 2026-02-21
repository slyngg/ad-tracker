import { useState, useEffect, useCallback } from 'react';
import { Plus, Star, Trash2, Link2 } from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import {
  BrandConfig, Account, Offer,
  fetchBrandConfigs, createBrandConfig, updateBrandConfig, deleteBrandConfig, setDefaultBrandConfig,
  fetchAccounts, fetchOffers, updateAccount, updateOffer,
} from '../../lib/api';

const FIELDS: { key: keyof BrandConfig; label: string; placeholder: string; textarea: boolean }[] = [
  { key: 'brand_name', label: 'Brand Name', placeholder: 'Your Brand', textarea: false },
  { key: 'logo_url', label: 'Logo URL', placeholder: 'https://...', textarea: false },
  { key: 'brand_colors', label: 'Brand Colors', placeholder: '#3b82f6, #1f2937', textarea: false },
  { key: 'tone_of_voice', label: 'Tone of Voice', placeholder: 'Professional, friendly, data-driven...', textarea: true },
  { key: 'target_audience', label: 'Target Audience', placeholder: 'E-commerce store owners aged 25-45...', textarea: true },
  { key: 'usp', label: 'Unique Selling Points', placeholder: 'What makes your brand unique...', textarea: true },
  { key: 'guidelines', label: 'Brand Guidelines', placeholder: 'Dos and don\'ts for brand communication...', textarea: true },
];

export default function BrandVaultPage() {
  const [configs, setConfigs] = useState<BrandConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', brand_name: '', logo_url: '', brand_colors: '', tone_of_voice: '', target_audience: '', usp: '', guidelines: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [linkAccountId, setLinkAccountId] = useState('');
  const [linkOfferId, setLinkOfferId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, o] = await Promise.all([fetchBrandConfigs(), fetchAccounts(), fetchOffers()]);
      setConfigs(c);
      setAccounts(a);
      setOffers(o);
      // Select first config if none selected
      if (c.length > 0 && (!selectedId || !c.find(x => x.id === selectedId))) {
        selectConfig(c[0]);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function selectConfig(c: BrandConfig) {
    setSelectedId(c.id);
    setForm({
      name: c.name,
      brand_name: c.brand_name || '',
      logo_url: c.logo_url || '',
      brand_colors: c.brand_colors || '',
      tone_of_voice: c.tone_of_voice || '',
      target_audience: c.target_audience || '',
      usp: c.usp || '',
      guidelines: c.guidelines || '',
    });
    setShowDelete(false);
  }

  const selected = configs.find(c => c.id === selectedId) || null;
  const linkedAccounts = accounts.filter(a => a.brand_config_id === selectedId);
  const linkedOffers = offers.filter(o => o.brand_config_id === selectedId);

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      if (selectedId) {
        const updated = await updateBrandConfig(selectedId, form);
        setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
      flash('success', 'Saved!');
    } catch { flash('error', 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleCreate() {
    try {
      const created = await createBrandConfig({ name: `Brand Config ${configs.length + 1}` });
      setConfigs(prev => [...prev, created]);
      selectConfig(created);
      flash('success', 'Created!');
    } catch { flash('error', 'Failed to create'); }
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await deleteBrandConfig(selectedId);
      const remaining = configs.filter(c => c.id !== selectedId);
      setConfigs(remaining);
      if (remaining.length > 0) selectConfig(remaining[0]);
      else setSelectedId(null);
      setShowDelete(false);
      flash('success', 'Deleted');
    } catch { flash('error', 'Failed to delete'); }
  }

  async function handleSetDefault() {
    if (!selectedId) return;
    try {
      await setDefaultBrandConfig(selectedId);
      setConfigs(prev => prev.map(c => ({ ...c, is_default: c.id === selectedId })));
      flash('success', 'Set as default');
    } catch { flash('error', 'Failed to set default'); }
  }

  async function linkAccount() {
    if (!linkAccountId || !selectedId) return;
    try {
      await updateAccount(Number(linkAccountId), { brand_config_id: selectedId } as any);
      setAccounts(prev => prev.map(a => a.id === Number(linkAccountId) ? { ...a, brand_config_id: selectedId } : a));
      setLinkAccountId('');
      flash('success', 'Account linked');
    } catch { flash('error', 'Failed to link account'); }
  }

  async function linkOffer() {
    if (!linkOfferId || !selectedId) return;
    try {
      await updateOffer(Number(linkOfferId), { brand_config_id: selectedId } as any);
      setOffers(prev => prev.map(o => o.id === Number(linkOfferId) ? { ...o, brand_config_id: selectedId } : o));
      setLinkOfferId('');
      flash('success', 'Offer linked');
    } catch { flash('error', 'Failed to link offer'); }
  }

  async function unlinkAccount(id: number) {
    try {
      await updateAccount(id, { brand_config_id: null } as any);
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, brand_config_id: null } : a));
    } catch {}
  }

  async function unlinkOffer(id: number) {
    try {
      await updateOffer(id, { brand_config_id: null } as any);
      setOffers(prev => prev.map(o => o.id === id ? { ...o, brand_config_id: null } : o));
    } catch {}
  }

  function flash(type: string, text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-md px-4 py-3 text-sm text-ats-text font-mono outline-none focus:border-ats-accent';
  const labelCls = 'text-xs text-ats-text-muted font-medium mb-1 block';

  if (loading) return <PageShell title="Brand Vault" subtitle="Multi-brand configurations"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Brand Vault" subtitle="Multi-brand configurations for AI content generation">
      <p className="text-sm text-ats-text-muted mb-4">Create brand configs per client/brand and link them to accounts and offers. The default config is used by Operator AI.</p>

      {message && <div className={`px-3 py-2 mb-4 rounded-md text-sm ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>{message.text}</div>}

      {/* Config Selector Strip */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {configs.map(c => (
          <button
            key={c.id}
            onClick={() => selectConfig(c)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              c.id === selectedId
                ? 'bg-ats-accent text-white border-ats-accent'
                : 'bg-ats-card text-ats-text border-ats-border hover:border-ats-accent/50'
            }`}
          >
            {c.is_default && <Star size={12} className="inline mr-1 -mt-0.5" />}
            {c.name}
          </button>
        ))}
        <button onClick={handleCreate} className="flex-shrink-0 px-3 py-2 rounded-lg border border-dashed border-ats-border text-ats-text-muted hover:text-ats-accent hover:border-ats-accent transition-colors text-sm">
          <Plus size={14} className="inline mr-1 -mt-0.5" />New
        </button>
      </div>

      {/* Selected Config Editor */}
      {selected && (
        <>
          <div className={`${cardCls} mb-4`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-ats-text">Editing: {selected.name}</h2>
                {selected.is_default && <span className="text-xs bg-ats-accent/20 text-ats-accent px-2 py-0.5 rounded-full">Default</span>}
              </div>
              <div className="flex gap-2">
                {!selected.is_default && (
                  <button onClick={handleSetDefault} className="px-3 py-1.5 text-xs text-ats-text-muted border border-ats-border rounded-md hover:text-ats-accent hover:border-ats-accent transition-colors">
                    <Star size={12} className="inline mr-1 -mt-0.5" />Set Default
                  </button>
                )}
                <button onClick={() => setShowDelete(true)} className="px-3 py-1.5 text-xs text-red-400 border border-ats-border rounded-md hover:border-red-400 transition-colors">
                  <Trash2 size={12} className="inline mr-1 -mt-0.5" />Delete
                </button>
              </div>
            </div>

            {/* Delete confirmation */}
            {showDelete && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                <p className="text-sm text-red-300 mb-2">Delete "{selected.name}"? This will unlink it from all accounts and offers.</p>
                <div className="flex gap-2">
                  <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-500">Delete</button>
                  <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 text-xs text-ats-text-muted hover:text-ats-text">Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Config Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Brand X" />
              </div>

              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className={labelCls}>{f.label}</label>
                  {f.textarea ? (
                    <textarea rows={3} value={(form as any)[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className={inputCls} />
                  ) : (
                    <input value={(form as any)[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className={inputCls} />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={handleSave} disabled={saving || !form.name} className="px-5 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Linked Accounts & Offers */}
          <div className={`${cardCls}`}>
            <h3 className="text-sm font-bold text-ats-text mb-3 flex items-center gap-1.5">
              <Link2 size={14} />Linked Accounts & Offers
            </h3>

            {/* Linked Accounts */}
            <div className="mb-4">
              <label className={labelCls}>Accounts using this config</label>
              {linkedAccounts.length === 0 ? (
                <p className="text-xs text-ats-text-muted mb-2">None linked</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-2">
                  {linkedAccounts.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ats-bg border border-ats-border rounded-md text-xs text-ats-text">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                      <button onClick={() => unlinkAccount(a.id)} className="text-ats-text-muted hover:text-red-400 ml-0.5">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select value={linkAccountId} onChange={e => setLinkAccountId(e.target.value)} className="flex-1 bg-ats-bg border border-ats-border rounded-md px-3 py-1.5 text-xs text-ats-text focus:border-ats-accent outline-none">
                  <option value="">Link an account...</option>
                  {accounts.filter(a => a.brand_config_id !== selectedId).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button onClick={linkAccount} disabled={!linkAccountId} className="px-3 py-1.5 bg-ats-accent text-white rounded-md text-xs font-semibold disabled:opacity-50">Link</button>
              </div>
            </div>

            {/* Linked Offers */}
            <div>
              <label className={labelCls}>Offers using this config</label>
              {linkedOffers.length === 0 ? (
                <p className="text-xs text-ats-text-muted mb-2">None linked</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-2">
                  {linkedOffers.map(o => (
                    <span key={o.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ats-bg border border-ats-border rounded-md text-xs text-ats-text">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color || '#6b7280' }} />
                      {o.name}
                      <button onClick={() => unlinkOffer(o.id)} className="text-ats-text-muted hover:text-red-400 ml-0.5">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select value={linkOfferId} onChange={e => setLinkOfferId(e.target.value)} className="flex-1 bg-ats-bg border border-ats-border rounded-md px-3 py-1.5 text-xs text-ats-text focus:border-ats-accent outline-none">
                  <option value="">Link an offer...</option>
                  {offers.filter(o => o.brand_config_id !== selectedId).map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <button onClick={linkOffer} disabled={!linkOfferId} className="px-3 py-1.5 bg-ats-accent text-white rounded-md text-xs font-semibold disabled:opacity-50">Link</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {configs.length === 0 && !loading && (
        <div className={`${cardCls} text-center py-8`}>
          <p className="text-sm text-ats-text-muted mb-3">No brand configs yet. Create your first to get started.</p>
          <button onClick={handleCreate} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600">Create Brand Config</button>
        </div>
      )}
    </PageShell>
  );
}
