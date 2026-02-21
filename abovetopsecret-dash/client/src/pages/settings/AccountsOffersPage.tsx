import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Building2, Tag } from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import {
  Account, Offer,
  fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchOffers, createOffer, updateOffer, deleteOffer,
} from '../../lib/api';

type Tab = 'accounts' | 'offers';

const PLATFORMS = ['meta', 'google', 'tiktok', 'shopify', 'klaviyo', 'other'];
const OFFER_TYPES = ['product', 'bundle', 'subscription', 'upsell', 'downsell', 'other'];
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function AccountsOffersPage() {
  const [tab, setTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  // Account modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [acctForm, setAcctForm] = useState({ name: '', platform: 'meta', platform_account_id: '', color: '#3b82f6', timezone: 'UTC', currency: 'USD', notes: '' });

  // Offer modal state
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [offerForm, setOfferForm] = useState({
    name: '', account_id: '' as string, offer_type: 'product', identifier: '', utm_campaign_match: '', campaign_name_match: '',
    product_ids: '', cogs: '0', shipping_cost: '0', handling_cost: '0', gateway_fee_pct: '0', gateway_fee_flat: '0',
    target_cpa: '', target_roas: '', color: '#3b82f6', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o] = await Promise.all([fetchAccounts(), fetchOffers()]);
      setAccounts(a);
      setOffers(o);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- Account handlers ---
  function openNewAccount() {
    setEditingAccount(null);
    setAcctForm({ name: '', platform: 'meta', platform_account_id: '', color: '#3b82f6', timezone: 'UTC', currency: 'USD', notes: '' });
    setShowAccountModal(true);
  }

  function openEditAccount(a: Account) {
    setEditingAccount(a);
    setAcctForm({ name: a.name, platform: a.platform, platform_account_id: a.platform_account_id || '', color: a.color, timezone: a.timezone, currency: a.currency, notes: a.notes || '' });
    setShowAccountModal(true);
  }

  async function saveAccount() {
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, acctForm);
      } else {
        await createAccount(acctForm);
      }
      setShowAccountModal(false);
      load();
    } catch (err) {
      console.error('Save account failed:', err);
    }
  }

  async function archiveAccount(id: number) {
    if (!confirm('Archive this account? It can be restored later.')) return;
    try {
      await deleteAccount(id);
      load();
    } catch (err) {
      console.error('Archive account failed:', err);
    }
  }

  // --- Offer handlers ---
  function openNewOffer() {
    setEditingOffer(null);
    setOfferForm({
      name: '', account_id: '', offer_type: 'product', identifier: '', utm_campaign_match: '', campaign_name_match: '',
      product_ids: '', cogs: '0', shipping_cost: '0', handling_cost: '0', gateway_fee_pct: '0', gateway_fee_flat: '0',
      target_cpa: '', target_roas: '', color: '#3b82f6', notes: '',
    });
    setShowOfferModal(true);
  }

  function openEditOffer(o: Offer) {
    setEditingOffer(o);
    setOfferForm({
      name: o.name, account_id: o.account_id ? String(o.account_id) : '', offer_type: o.offer_type, identifier: o.identifier || '',
      utm_campaign_match: o.utm_campaign_match || '', campaign_name_match: o.campaign_name_match || '',
      product_ids: (o.product_ids || []).join(', '), cogs: String(o.cogs || 0), shipping_cost: String(o.shipping_cost || 0),
      handling_cost: String(o.handling_cost || 0), gateway_fee_pct: String(o.gateway_fee_pct || 0), gateway_fee_flat: String(o.gateway_fee_flat || 0),
      target_cpa: o.target_cpa ? String(o.target_cpa) : '', target_roas: o.target_roas ? String(o.target_roas) : '',
      color: o.color || '#3b82f6', notes: o.notes || '',
    });
    setShowOfferModal(true);
  }

  async function saveOffer() {
    try {
      const payload: any = {
        ...offerForm,
        account_id: offerForm.account_id ? Number(offerForm.account_id) : null,
        product_ids: offerForm.product_ids ? offerForm.product_ids.split(',').map((s) => s.trim()).filter(Boolean) : [],
        cogs: parseFloat(offerForm.cogs) || 0,
        shipping_cost: parseFloat(offerForm.shipping_cost) || 0,
        handling_cost: parseFloat(offerForm.handling_cost) || 0,
        gateway_fee_pct: parseFloat(offerForm.gateway_fee_pct) || 0,
        gateway_fee_flat: parseFloat(offerForm.gateway_fee_flat) || 0,
        target_cpa: offerForm.target_cpa ? parseFloat(offerForm.target_cpa) : null,
        target_roas: offerForm.target_roas ? parseFloat(offerForm.target_roas) : null,
      };
      if (editingOffer) {
        await updateOffer(editingOffer.id, payload);
      } else {
        await createOffer(payload);
      }
      setShowOfferModal(false);
      load();
    } catch (err) {
      console.error('Save offer failed:', err);
    }
  }

  async function archiveOffer(id: number) {
    if (!confirm('Archive this offer?')) return;
    try {
      await deleteOffer(id);
      load();
    } catch (err) {
      console.error('Archive offer failed:', err);
    }
  }

  const cardCls = 'bg-ats-card rounded-xl border border-ats-border';
  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:border-ats-accent focus:outline-none';
  const labelCls = 'text-xs text-ats-text-muted font-medium mb-1 block';

  return (
    <PageShell title="Accounts & Offers" subtitle="Manage your ad accounts and offers">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-ats-card rounded-lg border border-ats-border p-1 w-fit">
        <button onClick={() => setTab('accounts')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'accounts' ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'}`}>
          <Building2 size={14} className="inline mr-1.5 -mt-0.5" />Accounts
        </button>
        <button onClick={() => setTab('offers')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'offers' ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:text-ats-text'}`}>
          <Tag size={14} className="inline mr-1.5 -mt-0.5" />Offers
        </button>
      </div>

      {/* Accounts Tab */}
      {tab === 'accounts' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ats-text">Ad Accounts</h2>
            <button onClick={openNewAccount} className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors">
              <Plus size={14} /> Add Account
            </button>
          </div>
          {loading ? (
            <div className="text-center py-12 text-sm text-ats-text-muted">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className={`${cardCls} p-8 text-center`}>
              <Building2 size={32} className="mx-auto text-ats-text-muted mb-3" />
              <p className="text-sm text-ats-text-muted mb-3">No accounts yet. Create your first ad account to start organizing data.</p>
              <button onClick={openNewAccount} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600">Create Account</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((a) => (
                <div key={a.id} className={`${cardCls} p-4`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="text-sm font-semibold text-ats-text">{a.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditAccount(a)} className="p-1 text-ats-text-muted hover:text-ats-accent"><Edit2 size={14} /></button>
                      <button onClick={() => archiveAccount(a.id)} className="p-1 text-ats-text-muted hover:text-ats-red"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="text-xs text-ats-text-muted space-y-0.5">
                    <div>Platform: <span className="text-ats-text capitalize">{a.platform}</span></div>
                    {a.platform_account_id && <div>Account ID: <span className="text-ats-text font-mono">{a.platform_account_id}</span></div>}
                    <div>Currency: {a.currency} / TZ: {a.timezone}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Offers Tab */}
      {tab === 'offers' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ats-text">Offers</h2>
            <button onClick={openNewOffer} className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors">
              <Plus size={14} /> Add Offer
            </button>
          </div>
          {loading ? (
            <div className="text-center py-12 text-sm text-ats-text-muted">Loading...</div>
          ) : offers.length === 0 ? (
            <div className={`${cardCls} p-8 text-center`}>
              <Tag size={32} className="mx-auto text-ats-text-muted mb-3" />
              <p className="text-sm text-ats-text-muted mb-3">No offers yet. Create offers to track per-product economics.</p>
              <button onClick={openNewOffer} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600">Create Offer</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offers.map((o) => (
                <div key={o.id} className={`${cardCls} p-4`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: o.color || '#6b7280' }} />
                      <span className="text-sm font-semibold text-ats-text">{o.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditOffer(o)} className="p-1 text-ats-text-muted hover:text-ats-accent"><Edit2 size={14} /></button>
                      <button onClick={() => archiveOffer(o.id)} className="p-1 text-ats-text-muted hover:text-ats-red"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="text-xs text-ats-text-muted space-y-0.5">
                    <div>Type: <span className="text-ats-text capitalize">{o.offer_type}</span></div>
                    {o.account_name && <div>Account: <span className="text-ats-text">{o.account_name}</span></div>}
                    {o.cogs > 0 && <div>COGS: <span className="text-ats-text font-mono">${o.cogs.toFixed(2)}</span></div>}
                    {o.target_roas && <div>Target ROAS: <span className="text-ats-text font-mono">{o.target_roas}x</span></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-ats-card rounded-2xl border border-ats-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-ats-text mb-4">{editingAccount ? 'Edit Account' : 'New Account'}</h3>
            <div className="space-y-3">
              <div><label className={labelCls}>Name *</label><input value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} className={inputCls} placeholder="e.g. Brand X - Meta" /></div>
              <div><label className={labelCls}>Platform</label>
                <select value={acctForm.platform} onChange={(e) => setAcctForm({ ...acctForm, platform: e.target.value })} className={inputCls}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Platform Account ID</label><input value={acctForm.platform_account_id} onChange={(e) => setAcctForm({ ...acctForm, platform_account_id: e.target.value })} className={inputCls} placeholder="e.g. act_123456789" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Currency</label><input value={acctForm.currency} onChange={(e) => setAcctForm({ ...acctForm, currency: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Timezone</label><input value={acctForm.timezone} onChange={(e) => setAcctForm({ ...acctForm, timezone: e.target.value })} className={inputCls} /></div>
              </div>
              <div>
                <label className={labelCls}>Color</label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setAcctForm({ ...acctForm, color: c })} className={`w-6 h-6 rounded-full border-2 ${acctForm.color === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div><label className={labelCls}>Notes</label><textarea value={acctForm.notes} onChange={(e) => setAcctForm({ ...acctForm, notes: e.target.value })} className={`${inputCls} h-16`} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAccountModal(false)} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text">Cancel</button>
              <button onClick={saveAccount} disabled={!acctForm.name} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-50">
                {editingAccount ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-ats-card rounded-2xl border border-ats-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-ats-text mb-4">{editingOffer ? 'Edit Offer' : 'New Offer'}</h3>
            <div className="space-y-3">
              <div><label className={labelCls}>Name *</label><input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} className={inputCls} placeholder="e.g. Main Product Bundle" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Account</label>
                  <select value={offerForm.account_id} onChange={(e) => setOfferForm({ ...offerForm, account_id: e.target.value })} className={inputCls}>
                    <option value="">None</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Offer Type</label>
                  <select value={offerForm.offer_type} onChange={(e) => setOfferForm({ ...offerForm, offer_type: e.target.value })} className={inputCls}>
                    {OFFER_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={labelCls}>UTM Campaign Match</label><input value={offerForm.utm_campaign_match} onChange={(e) => setOfferForm({ ...offerForm, utm_campaign_match: e.target.value })} className={inputCls} placeholder="e.g. *brand_x* (use * for wildcards)" /></div>
              <div><label className={labelCls}>Campaign Name Match</label><input value={offerForm.campaign_name_match} onChange={(e) => setOfferForm({ ...offerForm, campaign_name_match: e.target.value })} className={inputCls} placeholder="e.g. *BrandX*" /></div>
              <div><label className={labelCls}>Product IDs (comma-separated)</label><input value={offerForm.product_ids} onChange={(e) => setOfferForm({ ...offerForm, product_ids: e.target.value })} className={inputCls} placeholder="e.g. SKU-001, SKU-002" /></div>

              <div className="border-t border-ats-border pt-3 mt-3">
                <div className="text-xs font-semibold text-ats-text-muted uppercase mb-2">Unit Economics</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={labelCls}>COGS ($)</label><input type="number" value={offerForm.cogs} onChange={(e) => setOfferForm({ ...offerForm, cogs: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>Shipping ($)</label><input type="number" value={offerForm.shipping_cost} onChange={(e) => setOfferForm({ ...offerForm, shipping_cost: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>Handling ($)</label><input type="number" value={offerForm.handling_cost} onChange={(e) => setOfferForm({ ...offerForm, handling_cost: e.target.value })} className={inputCls} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div><label className={labelCls}>Gateway Fee %</label><input type="number" value={offerForm.gateway_fee_pct} onChange={(e) => setOfferForm({ ...offerForm, gateway_fee_pct: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>Gateway Fee Flat ($)</label><input type="number" value={offerForm.gateway_fee_flat} onChange={(e) => setOfferForm({ ...offerForm, gateway_fee_flat: e.target.value })} className={inputCls} /></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Target CPA ($)</label><input type="number" value={offerForm.target_cpa} onChange={(e) => setOfferForm({ ...offerForm, target_cpa: e.target.value })} className={inputCls} placeholder="Optional" /></div>
                <div><label className={labelCls}>Target ROAS (x)</label><input type="number" value={offerForm.target_roas} onChange={(e) => setOfferForm({ ...offerForm, target_roas: e.target.value })} className={inputCls} placeholder="Optional" /></div>
              </div>
              <div><label className={labelCls}>Notes</label><textarea value={offerForm.notes} onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })} className={`${inputCls} h-16`} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowOfferModal(false)} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text">Cancel</button>
              <button onClick={saveOffer} disabled={!offerForm.name} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-50">
                {editingOffer ? 'Save Changes' : 'Create Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
