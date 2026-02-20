import { useState, useEffect } from 'react';
import { OverrideRow, fetchOverrides, createOverride, deleteOverride as deleteOverrideApi, fetchMetrics } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import PageShell from '../../components/shared/PageShell';

const METRIC_OPTIONS = [
  'spend', 'revenue', 'roi', 'cpa', 'aov', 'ctr', 'cpm', 'cpc', 'cvr',
  'conversions', 'new_customer_pct', 'take_rate_1', 'take_rate_3', 'take_rate_5',
  'subscription_pct', 'upsell_take_rate', 'upsell_decline_rate',
];

export default function OverridesPage() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [offers, setOffers] = useState<string[]>([]);
  const [metricKey, setMetricKey] = useState('spend');
  const [offerName, setOfferName] = useState('ALL');
  const [overrideValue, setOverrideValue] = useState('');
  const [setBy, setSetBy] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOverrides().then(setOverrides).catch(() => {});
    fetchMetrics().then((data) => {
      const set = new Set(data.map((d) => d.offer_name));
      setOffers(Array.from(set));
    }).catch((err) => {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') handleUnauthorized();
    });
  }, [handleUnauthorized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideValue) return;
    setSaving(true);
    try {
      await createOverride({
        metric_key: metricKey,
        offer_name: offerName,
        override_value: parseFloat(overrideValue),
        set_by: setBy || 'admin',
      });
      const updated = await fetchOverrides();
      setOverrides(updated);
      setOverrideValue('');
    } catch {
      // error handled silently
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteOverrideApi(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch {
      // error handled silently
    }
  };

  const inputCls = "w-full px-4 py-3 bg-ats-bg border border-[#374151] rounded-md text-ats-text text-sm font-mono outline-none focus:border-ats-accent";
  const selectCls = `${inputCls} appearance-none`;
  const labelCls = "text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide";

  return (
    <PageShell title="Overrides" subtitle="Set manual metric overrides">
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="space-y-3 mb-4">
          <div>
            <label className={labelCls}>Metric</label>
            <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className={selectCls}>
              {METRIC_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Offer</label>
            <select value={offerName} onChange={(e) => setOfferName(e.target.value)} className={selectCls}>
              <option value="ALL">ALL (Global)</option>
              {offers.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Value</label>
            <input type="number" step="any" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)}
              placeholder="Override value" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Your Name</label>
            <input type="text" value={setBy} onChange={(e) => setSetBy(e.target.value)}
              placeholder="admin" className={inputCls} />
          </div>
        </div>
        <button type="submit" disabled={saving || !overrideValue}
          className={`w-full py-3 rounded-lg text-sm font-semibold text-white transition-colors ${
            overrideValue ? 'bg-ats-accent hover:bg-blue-600 cursor-pointer' : 'bg-ats-border cursor-default'
          }`}>
          {saving ? 'Saving...' : 'Set Override'}
        </button>
      </form>

      <h3 className="text-[13px] font-semibold text-ats-text-muted mb-3 uppercase tracking-wide">Active Overrides</h3>
      {overrides.length === 0 ? (
        <div className="text-[#4b5563] text-sm">No overrides set</div>
      ) : (
        <div className="space-y-2">
          {overrides.map((ov) => (
            <div key={ov.id} className="bg-ats-bg rounded-lg p-3 border border-ats-border flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-ats-text">
                  {ov.metric_key}
                  <span className="text-ats-text-muted font-normal"> = </span>
                  <span className="text-ats-yellow font-mono">{ov.override_value}</span>
                </div>
                <div className="text-[11px] text-ats-text-muted">{ov.offer_name} — by {ov.set_by}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(ov.id); }}
                className="bg-ats-border text-ats-red px-3.5 py-2.5 rounded-md text-xs cursor-pointer min-h-[44px] hover:bg-ats-hover transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
