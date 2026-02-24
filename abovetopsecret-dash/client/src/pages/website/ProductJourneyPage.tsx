import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface ProductRow { product_name: string; product_id: string; views: number; add_to_carts: number; purchases: number; revenue: number; cart_to_purchase_rate: number; }

export default function ProductJourneyPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await apiFetch<ProductRow[]>('/ga4/products?startDate=30&sort=views')); }
    catch { /* no data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';
  const selectedProduct = products.find(p => p.product_id === selected);

  if (loading) return <PageShell title="Product Journey" showDatePicker subtitle="View → Cart → Purchase path"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  if (!products.length) return (
    <PageShell title="Product Journey" showDatePicker subtitle="View → Cart → Purchase path">
      <div className={`${cardCls} text-center p-8`}>
        <div className="text-4xl mb-4">🛤️</div>
        <h3 className="text-lg font-bold text-ats-text mb-2">No Product Journey Data</h3>
        <p className="text-sm text-ats-text-muted">Requires GA4 enhanced ecommerce tracking.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Product Journey" showDatePicker subtitle="View → Cart → Purchase path">
      {/* Product selector */}
      <div className="mb-6">
        <select value={selected || ''} onChange={e => setSelected(e.target.value || null)} className="bg-ats-surface border border-ats-border rounded-lg px-4 py-2 text-sm text-ats-text">
          <option value="">Select a product...</option>
          {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
        </select>
      </div>

      {/* Journey Funnel for selected product */}
      {selectedProduct && (
        <div className={`${cardCls} mb-6`}>
          <h3 className="text-sm font-semibold text-ats-text mb-4">Journey: {selectedProduct.product_name}</h3>
          <div className="space-y-3">
            {[
              { label: 'Views', value: selectedProduct.views, color: '#3b82f6' },
              { label: 'Add to Cart', value: selectedProduct.add_to_carts, color: '#8b5cf6' },
              { label: 'Purchases', value: selectedProduct.purchases, color: '#10b981' },
            ].map((step, i, arr) => {
              const maxVal = Math.max(arr[0].value, 1);
              const pct = (step.value / maxVal) * 100;
              const dropoff = i > 0 && arr[i - 1].value > 0 ? ((arr[i - 1].value - step.value) / arr[i - 1].value * 100).toFixed(1) : null;
              return (
                <div key={step.label}>
                  {dropoff && <div className="text-right text-xs text-ats-text-muted mb-1">↓ {dropoff}% drop-off</div>}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-sm text-ats-text font-semibold">{step.label}</div>
                    <div className="flex-1 bg-ats-bg rounded-full h-8 overflow-hidden">
                      <div className="h-full rounded-full flex items-center px-3" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: step.color }}>
                        <span className="text-xs font-mono text-white font-bold">{step.value.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Products Table */}
      <div className={`${cardCls} overflow-hidden`}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">All Products</h3>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Product', 'Views', 'Add to Cart', 'Purchases', 'Cart→Purchase', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {products.map((p, i) => <tr key={i} className={`border-b border-ats-border last:border-0 hover:bg-ats-hover/50 cursor-pointer ${selected === p.product_id ? 'bg-ats-accent/10' : ''}`} onClick={() => setSelected(p.product_id)}>
              <td className="px-3 py-2 text-sm text-ats-text font-semibold max-w-[200px] truncate">{p.product_name}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.views).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.add_to_carts).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.purchases).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(p.cart_to_purchase_rate)) * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(p.revenue)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
