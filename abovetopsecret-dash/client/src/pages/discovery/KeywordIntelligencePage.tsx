import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

interface KeywordData {
  keyword: string;
  count: number;
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  roas: number;
}

type SortKey = 'keyword' | 'count' | 'totalSpend' | 'totalRevenue' | 'roas';
type SortDir = 'asc' | 'desc';

// Common stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'it', 'as', 'be', 'this', 'that', 'from',
  'was', 'are', 'were', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
  'not', 'no', 'so', 'if', 'up', 'out', 'all', 'its', 'my', 'we',
  'our', 'your', 'new', 'ad', 'ads', 'set', 'copy', 'v1', 'v2', 'v3',
  'test', '01', '02', '03', '04', '05', '1', '2', '3', '4', '5',
]);

function extractKeywords(metrics: MetricRow[]): KeywordData[] {
  const keywordMap = new Map<string, { rows: MetricRow[] }>();

  for (const row of metrics) {
    const name = row.offer_name || '';
    // Split on common delimiters: space, underscore, hyphen, pipe, slash
    const words = name
      .toLowerCase()
      .split(/[\s_\-|/]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

    // Deduplicate words per campaign
    const unique = [...new Set(words)];
    for (const word of unique) {
      const existing = keywordMap.get(word) || { rows: [] };
      existing.rows.push(row);
      keywordMap.set(word, existing);
    }
  }

  const results: KeywordData[] = [];
  for (const [keyword, { rows }] of keywordMap) {
    // Only include keywords that appear in at least 1 campaign
    const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalConversions = rows.reduce((s, r) => s + (r.conversions || 0), 0);

    results.push({
      keyword,
      count: rows.length,
      totalSpend,
      totalRevenue,
      totalConversions,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    });
  }

  return results;
}

export default function KeywordIntelligencePage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('totalSpend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useLiveRefresh(loadData);

  const keywords = useMemo(() => extractKeywords(metrics), [metrics]);

  const filtered = useMemo(() => {
    let data = keywords;
    if (filter) {
      const f = filter.toLowerCase();
      data = data.filter((k) => k.keyword.includes(f));
    }
    return [...data].sort((a, b) => {
      let aVal: number | string = a[sortKey];
      let bVal: number | string = b[sortKey];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [keywords, sortKey, sortDir, filter]);

  // Word cloud data: top 30 keywords by spend
  const wordCloudData = useMemo(() => {
    const sorted = [...keywords].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 30);
    if (sorted.length === 0) return [];
    const maxSpend = sorted[0].totalSpend;
    const minSpend = sorted[sorted.length - 1].totalSpend;
    const range = maxSpend - minSpend || 1;

    return sorted.map((kw) => {
      const normalized = (kw.totalSpend - minSpend) / range;
      const fontSize = 12 + normalized * 28; // 12px to 40px
      return { ...kw, fontSize };
    });
  }, [keywords]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ^' : ' v';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <PageShell title="Keyword Intelligence" subtitle="Extract insights from campaign naming patterns">
        <div className="px-3 py-2 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Keyword Intelligence" subtitle="Performance analysis by extracted keywords from campaign names">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Keywords Found</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{keywords.length}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Campaigns Analyzed</div>
          <div className="text-2xl font-bold text-ats-text font-mono">{metrics.length}</div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Top Keyword</div>
          <div className="text-lg font-bold text-ats-accent font-mono truncate">
            {keywords.length > 0
              ? [...keywords].sort((a, b) => b.totalSpend - a.totalSpend)[0].keyword
              : '-'}
          </div>
        </div>
        <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
          <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Best ROAS Keyword</div>
          <div className="text-lg font-bold text-ats-green font-mono truncate">
            {keywords.filter((k) => k.totalSpend > 0).length > 0
              ? [...keywords].filter((k) => k.totalSpend > 0).sort((a, b) => b.roas - a.roas)[0].keyword
              : '-'}
          </div>
        </div>
      </div>

      {/* Word Cloud */}
      <div className="bg-ats-card border border-ats-border rounded-lg p-6 mb-6">
        <h3 className="text-sm font-semibold text-ats-text mb-4">Keyword Cloud (by Spend)</h3>
        {wordCloudData.length === 0 ? (
          <p className="text-sm text-ats-text-muted text-center py-8">No keywords extracted</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3 min-h-[200px]">
            {wordCloudData.map((kw) => (
              <span
                key={kw.keyword}
                className={`font-semibold transition-colors cursor-default ${
                  kw.roas >= 2 ? 'text-ats-green' : kw.roas >= 1 ? 'text-ats-yellow' : 'text-ats-red'
                }`}
                style={{ fontSize: `${kw.fontSize}px` }}
                title={`${kw.keyword}: ${fmt.currency(kw.totalSpend)} spend, ${fmt.ratio(kw.roas)} ROAS`}
              >
                {kw.keyword}
              </span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-ats-text-muted text-center mt-3">
          Size = spend volume. Color: green = ROAS 2x+, yellow = 1-2x, red = below 1x.
        </p>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter keywords..."
          className="px-4 py-2 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text outline-none focus:border-ats-accent w-full max-w-sm"
        />
      </div>

      {/* Keywords Table */}
      <div className="bg-ats-card border border-ats-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border text-ats-text-muted">
                {([
                  ['keyword', 'Keyword'],
                  ['count', 'Campaigns'],
                  ['totalSpend', 'Spend'],
                  ['totalRevenue', 'Revenue'],
                  ['roas', 'ROAS'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-ats-text transition-colors select-none"
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((kw) => (
                <tr key={kw.keyword} className="border-b border-ats-border/50 hover:bg-ats-hover">
                  <td className="px-4 py-2.5 text-ats-text font-semibold font-mono">{kw.keyword}</td>
                  <td className="px-4 py-2.5 text-ats-text-muted font-mono">{kw.count}</td>
                  <td className="px-4 py-2.5 text-ats-text font-mono">{fmt.currency(kw.totalSpend)}</td>
                  <td className="px-4 py-2.5 text-ats-green font-mono">{fmt.currency(kw.totalRevenue)}</td>
                  <td className="px-4 py-2.5 font-mono">
                    <span
                      className={
                        kw.roas >= 2 ? 'text-ats-green' : kw.roas >= 1 ? 'text-ats-yellow' : 'text-ats-red'
                      }
                    >
                      {fmt.ratio(kw.roas)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ats-text-muted">
                    {filter ? 'No keywords match the filter' : 'No keyword data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <div className="px-4 py-2 border-t border-ats-border text-xs text-ats-text-muted text-center">
            Showing first 100 of {filtered.length} keywords
          </div>
        )}
      </div>
    </PageShell>
  );
}
