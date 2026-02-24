import { useState, useEffect, useCallback } from 'react';
import { fetchCosts, saveCost, deleteCost, fetchMetrics, CostSetting } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';

const COST_TYPES = ['cogs', 'shipping', 'handling', 'payment_processing'] as const;
const COST_UNITS = ['fixed', 'percentage'] as const;

const COST_TYPE_LABELS: Record<string, string> = {
  cogs: 'COGS',
  shipping: 'Shipping',
  handling: 'Handling',
  payment_processing: 'Payment Processing',
};

interface FormData {
  offer_name: string;
  cost_type: string;
  cost_value: string;
  cost_unit: string;
  notes: string;
}

const emptyForm: FormData = {
  offer_name: '',
  cost_type: 'cogs',
  cost_value: '',
  cost_unit: 'fixed',
  notes: '',
};

export default function CostSettingsPage() {
  const [costs, setCosts] = useState<CostSetting[]>([]);
  const [offers, setOffers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [costsData, metricsData] = await Promise.all([fetchCosts(), fetchMetrics()]);
      setCosts(costsData);
      const offerNames = [...new Set(metricsData.map((m) => m.offer_name))].sort();
      setOffers(offerNames);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (cost: CostSetting) => {
    setEditingId(cost.id);
    setForm({
      offer_name: cost.offer_name,
      cost_type: cost.cost_type,
      cost_value: String(cost.cost_value),
      cost_unit: cost.cost_unit,
      notes: cost.notes || '',
    });
    setShowForm(true);
    setMessage(null);
  };

  const handleAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.offer_name || !form.cost_value) {
      setMessage({ type: 'error', text: 'Offer name and cost value are required' });
      return;
    }
    const value = parseFloat(form.cost_value);
    if (isNaN(value) || value < 0) {
      setMessage({ type: 'error', text: 'Cost value must be a valid positive number' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload: Partial<CostSetting> = {
        offer_name: form.offer_name,
        cost_type: form.cost_type,
        cost_value: value,
        cost_unit: form.cost_unit,
        notes: form.notes || undefined,
      };
      if (editingId !== null) {
        payload.id = editingId;
      }
      await saveCost(payload);
      setMessage({ type: 'success', text: editingId !== null ? 'Cost setting updated' : 'Cost setting created' });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    setMessage(null);
    try {
      await deleteCost(id);
      setMessage({ type: 'success', text: 'Cost setting deleted' });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const inputCls = "w-full px-3 py-2.5 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent transition-colors";
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";
  const selectCls = `${inputCls} appearance-none`;

  // Summary stats
  const totalFixed = costs.filter((c) => c.cost_unit === 'fixed').reduce((s, c) => s + c.cost_value, 0);
  const totalPct = costs.filter((c) => c.cost_unit === 'percentage').length;
  const uniqueOffers = new Set(costs.map((c) => c.offer_name)).size;

  return (
    <PageShell
      title="Cost Settings"
      subtitle="Manage COGS, shipping, handling and processing costs per offer"
      actions={
        <button
          onClick={handleAdd}
          className="bg-ats-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          + Add Cost
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Cost Rules</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{costs.length}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Total Fixed</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(totalFixed)}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Offers Covered</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{uniqueOffers}</div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-ats-card rounded-xl border border-ats-accent/50 p-5 mb-6">
          <h3 className="text-sm font-bold text-ats-text mb-4">
            {editingId !== null ? 'Edit Cost Setting' : 'Add Cost Setting'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Offer Name</label>
              {offers.length > 0 ? (
                <select
                  value={form.offer_name}
                  onChange={(e) => updateField('offer_name', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select offer...</option>
                  {offers.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.offer_name}
                  onChange={(e) => updateField('offer_name', e.target.value)}
                  placeholder="Enter offer name"
                  className={inputCls}
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Cost Type</label>
              <select
                value={form.cost_type}
                onChange={(e) => updateField('cost_type', e.target.value)}
                className={selectCls}
              >
                {COST_TYPES.map((t) => (
                  <option key={t} value={t}>{COST_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cost Value</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost_value}
                  onChange={(e) => updateField('cost_value', e.target.value)}
                  placeholder={form.cost_unit === 'percentage' ? '3.5' : '5.00'}
                  className={`${inputCls} flex-1`}
                />
                <select
                  value={form.cost_unit}
                  onChange={(e) => updateField('cost_unit', e.target.value)}
                  className={`${selectCls} w-28`}
                >
                  {COST_UNITS.map((u) => (
                    <option key={u} value={u}>{u === 'fixed' ? '$ Fixed' : '% Pct'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any additional notes about this cost..."
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-ats-accent text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId !== null ? 'Update' : 'Create'}
            </button>
            <button
              onClick={handleCancel}
              className="bg-ats-border text-ats-text-muted px-5 py-2.5 rounded-lg text-sm hover:bg-ats-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-5 text-ats-red text-sm">{error}</div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ats-border bg-ats-bg/50">
                  <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Offer</th>
                  <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Type</th>
                  <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Value</th>
                  <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Unit</th>
                  <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Notes</th>
                  <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {costs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-ats-text-muted text-sm">
                      <div className="mb-2">No cost settings configured</div>
                      <div className="text-xs">Click "Add Cost" to create your first cost rule.</div>
                    </td>
                  </tr>
                ) : (
                  costs.map((cost) => (
                    <tr key={cost.id} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-semibold text-ats-text">{cost.offer_name}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded bg-ats-bg text-ats-text-muted font-mono">
                          {COST_TYPE_LABELS[cost.cost_type] || cost.cost_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-mono text-ats-text">
                        {cost.cost_unit === 'percentage' ? fmt.pctRaw(cost.cost_value) : fmt.currency(cost.cost_value)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-ats-text-muted capitalize">{cost.cost_unit}</td>
                      <td className="px-3 py-2.5 text-sm text-ats-text-muted max-w-[200px] truncate">{cost.notes || '-'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {deleteConfirmId === cost.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-ats-red">Delete?</span>
                            <button
                              onClick={() => handleDelete(cost.id)}
                              disabled={deleting}
                              className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900 transition-colors disabled:opacity-60"
                            >
                              {deleting ? '...' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs px-2 py-1 bg-ats-border text-ats-text-muted rounded hover:bg-ats-hover transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(cost)}
                              className="text-xs px-2.5 py-1 bg-ats-border text-ats-text-muted rounded hover:bg-ats-hover hover:text-ats-text transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(cost.id)}
                              className="text-xs px-2.5 py-1 bg-ats-border text-ats-text-muted rounded hover:bg-red-900/50 hover:text-red-300 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      {!loading && (
        <div className="mt-6 bg-ats-bg/50 rounded-lg border border-ats-border p-4">
          <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-2">How Cost Settings Work</h4>
          <ul className="text-xs text-ats-text-muted space-y-1">
            <li><strong>COGS</strong> - Cost of goods sold, deducted from revenue to calculate gross profit.</li>
            <li><strong>Shipping</strong> - Shipping costs per order, can be fixed amount or percentage of order value.</li>
            <li><strong>Handling</strong> - Fulfillment and handling fees per order.</li>
            <li><strong>Payment Processing</strong> - Gateway fees, typically a percentage (e.g., 2.9% + $0.30).</li>
          </ul>
        </div>
      )}
    </PageShell>
  );
}
