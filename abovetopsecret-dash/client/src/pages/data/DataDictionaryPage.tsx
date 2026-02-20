import { useState, useEffect, useCallback, useMemo } from 'react';
import PageShell from '../../components/shared/PageShell';
import { getAuthToken } from '../../stores/authStore';

async function apiFetch<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface ColInfo { column_name: string; data_type: string; is_nullable: string; description: string; example_value: string; category: string; }

export default function DataDictionaryPage() {
  const [tables, setTables] = useState<Record<string, ColInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => { setLoading(true); try { setTables(await apiFetch('/data-dictionary')); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const tableNames = useMemo(() => Object.keys(tables).sort(), [tables]);
  const filtered = useMemo(() => {
    if (!search) return tableNames;
    const q = search.toLowerCase();
    return tableNames.filter(t => t.includes(q) || tables[t].some(c => c.column_name.includes(q)));
  }, [tableNames, tables, search]);

  useEffect(() => { if (filtered.length > 0 && !selected) setSelected(filtered[0]); }, [filtered, selected]);

  const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

  if (loading) return <PageShell title="Data Dictionary" subtitle="Schema browser"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Data Dictionary" subtitle="Schema browser" actions={<input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables..." className="bg-ats-surface border border-ats-border rounded-lg px-3 py-1.5 text-sm text-ats-text" />}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className={`${cardCls} lg:col-span-1 max-h-[600px] overflow-y-auto`}>
          <h3 className="text-sm font-semibold text-ats-text mb-2">Tables ({filtered.length})</h3>
          <div className="space-y-1">{filtered.map(t => <button key={t} onClick={() => setSelected(t)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selected === t ? 'bg-ats-accent text-white' : 'text-ats-text-muted hover:bg-ats-hover'}`}>{t} <span className="text-xs opacity-50">({tables[t].length})</span></button>)}</div>
        </div>
        <div className="lg:col-span-3">
          {selected && tables[selected] ? (
            <div className={`${cardCls} overflow-hidden`}>
              <h3 className="text-sm font-semibold text-ats-text mb-3">{selected}</h3>
              <table className="w-full"><thead><tr className="border-b border-ats-border">{['Column', 'Type', 'Nullable', 'Description', 'Example'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted">{h}</th>)}</tr></thead><tbody>
                {tables[selected].map((col, i) => <tr key={i} className="border-b border-ats-border last:border-0 hover:bg-ats-hover/50">
                  <td className="px-3 py-2 text-sm font-mono text-ats-accent">{col.column_name}</td>
                  <td className="px-3 py-2 text-sm font-mono text-ats-text-muted">{col.data_type}</td>
                  <td className="px-3 py-2 text-sm text-ats-text-muted">{col.is_nullable === 'YES' ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-sm text-ats-text">{col.description || '-'}</td>
                  <td className="px-3 py-2 text-sm font-mono text-ats-text-muted">{col.example_value || '-'}</td>
                </tr>)}
              </tbody></table>
            </div>
          ) : <div className={`${cardCls} text-center p-8`}><p className="text-sm text-ats-text-muted">Select a table to view its schema.</p></div>}
        </div>
      </div>
    </PageShell>
  );
}
