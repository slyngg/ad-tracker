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

interface ProductRow { product_name: string; product_id: string; category: string; views: number; add_to_carts: number; purchases: number; revenue: number; cart_to_purchase_rate: number; avg_price: number; }

export default function ProductAnalysisPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('revenue');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await apiFetch<ProductRow[]>(`/ga4/products?startDate=30&sort=${sort}`)); }
    catch { /* no data */ }
    finally { setLoading(false); }
  }, [sort]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const filtered = products.filter(p => !search || p.product_name.toLowerCase().includes(search.toLowerCase()));
  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Product Analysis" subtitle="Per-product performance"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  if (!products.length) return (
    <PageShell title="Product Analysis" subtitle="Per-product performance">
      <div className={`${cardCls} text-center p-8`}>
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-bold text-ats-text mb-2">No Product Data</h3>
        <p className="text-sm text-ats-text-muted">Requires GA4 enhanced ecommerce tracking.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Product Analysis" subtitle="Per-product performance" actions={
      <div className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />
        <select value={sort} onChange={e => setSort(e.target.value)} className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text">
          <option value="revenue">Sort: Revenue</option>
          <option value="purchases">Sort: Purchases</option>
          <option value="views">Sort: Views</option>
        </select>
      </div>
    }>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Products</div><div className="text-2xl font-bold text-ats-text font-mono">{products.length}</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Total Revenue</div><div className="text-2xl font-bold text-ats-accent font-mono">${products.reduce((s, p) => s + parseFloat(String(p.revenue)), 0).toFixed(0)}</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Total Purchases</div><div className="text-2xl font-bold text-ats-text font-mono">{products.reduce((s, p) => s + Number(p.purchases), 0).toLocaleString()}</div></div>
        <div className={cardCls}><div className="text-[11px] text-ats-text-muted uppercase font-mono mb-1">Avg Price</div><div className="text-2xl font-bold text-ats-text font-mono">${(products.reduce((s, p) => s + parseFloat(String(p.avg_price)), 0) / (products.length || 1)).toFixed(2)}</div></div>
      </div>

      {/* Products Table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-ats-border bg-ats-bg/50">
            {['Product', 'Category', 'Views', 'Add to Cart', 'Purchases', 'Cart→Purchase', 'Revenue', 'Avg Price'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}
          </tr></thead><tbody>
            {filtered.map((p, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
              <td className="px-3 py-2 text-sm text-ats-text font-semibold max-w-[200px] truncate">{p.product_name}</td>
              <td className="px-3 py-2 text-sm text-ats-text-muted">{p.category || '-'}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.views).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.add_to_carts).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{Number(p.purchases).toLocaleString()}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">{(parseFloat(String(p.cart_to_purchase_rate)) * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-accent">${parseFloat(String(p.revenue)).toFixed(2)}</td>
              <td className="px-3 py-2 text-sm font-mono text-ats-text">${parseFloat(String(p.avg_price)).toFixed(2)}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>
    </PageShell>
  );
}
