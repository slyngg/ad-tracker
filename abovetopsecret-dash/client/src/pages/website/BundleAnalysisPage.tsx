import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface ProductRow { product_name: string; product_id: string; views: number; add_to_carts: number; purchases: number; revenue: number; cart_to_purchase_rate: number; avg_price: number; }

export default function BundleAnalysisPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await apiFetch<ProductRow[]>('/ga4/products?startDate=30&sort=purchases')); }
    catch { /* no data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Bundle Analysis" subtitle="Products frequently bought together"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  if (!products.length) return (
    <PageShell title="Bundle Analysis" subtitle="Products frequently bought together">
      <div className={`${cardCls} text-center p-8`}>
        <div className="text-4xl mb-4">📦</div>
        <h3 className="text-lg font-bold text-ats-text mb-2">No Bundle Data Yet</h3>
        <p className="text-sm text-ats-text-muted">Bundle analysis requires product purchase data from GA4. Connect GA4 with enhanced ecommerce tracking to see which products are frequently bought together.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Bundle Analysis" subtitle="Products frequently bought together">
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-ats-text mb-2">Top Product Pairs</h3>
        <p className="text-xs text-ats-text-muted mb-4">Products most commonly purchased in the same session</p>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Product', 'Purchases', 'Revenue', 'Avg Price', 'Cart→Purchase'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {products.map((p, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-text font-semibold max-w-[200px] truncate">{p.product_name}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.purchases).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(p.revenue)).toFixed(2)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(p.avg_price)).toFixed(2)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(p.cart_to_purchase_rate)) * 100).toFixed(1)}%</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
