import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchMetrics, MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';
import PageShell from '../../components/shared/PageShell';

const STORAGE_KEY = 'opticdata_search_bookmarks';

interface BookmarkedRow {
  offer_name: string;
  account_name: string;
}

function loadBookmarks(): BookmarkedRow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: BookmarkedRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function isBookmarked(bookmarks: BookmarkedRow[], row: MetricRow): boolean {
  return bookmarks.some(
    (b) => b.offer_name === row.offer_name && b.account_name === row.account_name,
  );
}

type SortableCol = 'offer_name' | 'account_name' | 'spend' | 'revenue' | 'roi' | 'cpa' | 'conversions' | 'ctr' | 'cpc';

export default function SiteSearchPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<SortableCol>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [bookmarks, setBookmarks] = useState<BookmarkedRow[]>(loadBookmarks);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMetrics()
      .then((data) => {
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleBookmark = useCallback((row: MetricRow) => {
    setBookmarks((prev) => {
      const exists = prev.some(
        (b) => b.offer_name === row.offer_name && b.account_name === row.account_name,
      );
      let next: BookmarkedRow[];
      if (exists) {
        next = prev.filter(
          (b) => !(b.offer_name === row.offer_name && b.account_name === row.account_name),
        );
      } else {
        next = [...prev, { offer_name: row.offer_name, account_name: row.account_name }];
      }
      saveBookmarks(next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let rows = [...metrics];

    // Filter by bookmarks
    if (showBookmarksOnly) {
      rows = rows.filter((r) => isBookmarked(bookmarks, r));
    }

    // Full-text search
    if (query.trim()) {
      const terms = query.toLowerCase().split(/\s+/);
      rows = rows.filter((row) => {
        const searchable = `${row.offer_name} ${row.account_name}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      });
    }

    // Sort
    rows.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return rows;
  }, [metrics, query, sortCol, sortDir, showBookmarksOnly, bookmarks]);

  const handleSort = useCallback((col: SortableCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }, [sortCol]);

  const sortArrow = (col: SortableCol) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  // Summary of filtered results
  const resultSummary = useMemo(() => {
    const totalSpend = filtered.reduce((s, r) => s + r.spend, 0);
    const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const totalConversions = filtered.reduce((s, r) => s + r.conversions, 0);
    return { totalSpend, totalRevenue, totalConversions };
  }, [filtered]);

  const thCls = "px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold text-ats-text-muted cursor-pointer hover:text-ats-text transition-colors select-none whitespace-nowrap";
  const tdCls = "px-3 py-2.5 text-sm font-mono whitespace-nowrap";

  return (
    <PageShell
      title="Campaign Search"
      subtitle="Search and filter across all campaign data"
    >
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ats-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns, offers, accounts..."
            className="w-full pl-10 pr-4 py-3 bg-ats-bg border border-[#374151] rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent transition-colors"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ats-text-muted hover:text-ats-text transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
          className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
            showBookmarksOnly
              ? 'bg-ats-accent text-white'
              : 'bg-ats-border text-ats-text-muted hover:bg-ats-hover'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={showBookmarksOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
          Bookmarks ({bookmarks.length})
        </button>
      </div>

      {/* Result summary strip */}
      <div className="flex items-center gap-4 mb-4 text-xs font-mono text-ats-text-muted">
        <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        <span className="text-ats-border">|</span>
        <span>Spend: {fmt.currency(resultSummary.totalSpend)}</span>
        <span className="text-ats-border">|</span>
        <span>Revenue: {fmt.currency(resultSummary.totalRevenue)}</span>
        <span className="text-ats-border">|</span>
        <span>Conv: {fmt.num(resultSummary.totalConversions)}</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-ats-card rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-5 text-ats-red text-sm">{error}</div>
      )}

      {/* Results Table */}
      {!loading && !error && (
        <div className="bg-ats-card rounded-xl border border-ats-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ats-border bg-ats-bg/50">
                  <th className="px-3 py-2.5 w-10" />
                  <th className={thCls} onClick={() => handleSort('offer_name')}>Offer{sortArrow('offer_name')}</th>
                  <th className={thCls} onClick={() => handleSort('account_name')}>Account{sortArrow('account_name')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('spend')}>Spend{sortArrow('spend')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('revenue')}>Revenue{sortArrow('revenue')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('roi')}>ROAS{sortArrow('roi')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('cpa')}>CPA{sortArrow('cpa')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('conversions')}>Conv{sortArrow('conversions')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('ctr')}>CTR{sortArrow('ctr')}</th>
                  <th className={`${thCls} text-right`} onClick={() => handleSort('cpc')}>CPC{sortArrow('cpc')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-ats-text-muted text-sm">
                      {query
                        ? `No results found for "${query}"`
                        : showBookmarksOnly
                        ? 'No bookmarked campaigns. Click the bookmark icon on any row to save it.'
                        : 'No data available'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => {
                    const bookmarked = isBookmarked(bookmarks, row);
                    const roasVal = row.spend > 0 ? row.revenue / row.spend : 0;
                    const roasColor = roasVal >= 2 ? 'text-ats-green' : roasVal >= 1 ? 'text-ats-yellow' : 'text-ats-red';

                    return (
                      <tr
                        key={`${row.offer_name}-${row.account_name}-${i}`}
                        className={`border-b border-ats-border last:border-0 hover:bg-ats-hover/50 transition-colors ${
                          bookmarked ? 'bg-ats-accent/5' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleBookmark(row)}
                            className="text-ats-text-muted hover:text-ats-accent transition-colors"
                            title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                          >
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill={bookmarked ? '#3b82f6' : 'none'}
                              stroke={bookmarked ? '#3b82f6' : 'currentColor'}
                              strokeWidth={2}
                            >
                              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                            </svg>
                          </button>
                        </td>
                        <td className={`${tdCls} text-ats-text font-semibold max-w-[180px] truncate`}>
                          {highlightMatch(row.offer_name, query)}
                        </td>
                        <td className={`${tdCls} text-ats-text-muted max-w-[140px] truncate`}>
                          {highlightMatch(row.account_name, query)}
                        </td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.spend)}</td>
                        <td className={`${tdCls} text-right text-ats-green`}>{fmt.currency(row.revenue)}</td>
                        <td className={`${tdCls} text-right ${roasColor}`}>{fmt.ratio(roasVal)}</td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.currency(row.cpa)}</td>
                        <td className={`${tdCls} text-right text-ats-text`}>{fmt.num(row.conversions)}</td>
                        <td className={`${tdCls} text-right text-ats-text-muted`}>{fmt.pctRaw(row.ctr)}</td>
                        <td className={`${tdCls} text-right text-ats-text-muted`}>{fmt.currency(row.cpc)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      {!loading && (
        <div className="mt-4 text-center text-[11px] text-ats-text-muted font-mono">
          {filtered.length} of {metrics.length} campaigns shown
        </div>
      )}
    </PageShell>
  );
}

/** Highlight matching text segments in search results */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;

  // Find match ranges
  const lowerText = text.toLowerCase();
  const ranges: [number, number][] = [];

  for (const term of terms) {
    let idx = 0;
    while (idx < lowerText.length) {
      const found = lowerText.indexOf(term, idx);
      if (found === -1) break;
      ranges.push([found, found + term.length]);
      idx = found + 1;
    }
  }

  if (!ranges.length) return text;

  // Merge overlapping ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) {
      parts.push(text.slice(cursor, start));
    }
    parts.push(
      <span key={start} className="bg-ats-accent/30 text-ats-accent rounded px-0.5">
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}
