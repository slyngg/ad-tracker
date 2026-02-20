import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuthStore } from '../../stores/authStore';
import SummaryCards from '../../components/dashboard/SummaryCards';
import Filters from '../../components/dashboard/Filters';
import MetricsTable from '../../components/dashboard/MetricsTable';
import MobileCard from '../../components/dashboard/MobileCard';
import ExportButton from '../../components/dashboard/ExportButton';
import LiveOrderFeed from '../../components/dashboard/LiveOrderFeed';
import PageShell from '../../components/shared/PageShell';

export default function AttributionDashboard() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);

  const [filterOffer, setFilterOffer] = useState('All');
  const [filterAccount, setFilterAccount] = useState('All');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, summary, loading, refreshing, error, lastFetched, refresh } = useMetrics(
    undefined, undefined, handleUnauthorized
  );

  const offers = useMemo(() => {
    const set = new Set(data.map((d) => d.offer_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  const accounts = useMemo(() => {
    const set = new Set(data.map((d) => d.account_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  const filtered = useMemo(() => {
    let rows = [...data];
    if (filterOffer !== 'All') rows = rows.filter((r) => r.offer_name === filterOffer);
    if (filterAccount !== 'All') rows = rows.filter((r) => r.account_name === filterAccount);

    rows.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortCol];
      const bVal = (b as unknown as Record<string, unknown>)[sortCol];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return rows;
  }, [data, filterOffer, filterAccount, sortCol, sortDir]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }, [sortCol]);

  const syncAge = useMemo(() => {
    if (!lastFetched) return { text: 'syncing...', color: 'text-ats-text-muted' };
    const seconds = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (seconds < 60) return { text: `${seconds}s ago`, color: 'text-ats-text-muted' };
    const minutes = Math.floor(seconds / 60);
    if (minutes > 5) return { text: `${minutes}m ago`, color: 'text-ats-red' };
    if (minutes > 2) return { text: `${minutes}m ago`, color: 'text-ats-yellow' };
    return { text: `${minutes}m ago`, color: 'text-ats-text-muted' };
  }, [lastFetched]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const [isWide, setIsWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );
  useEffect(() => {
    const handleResize = () => setIsWide(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showTable = viewMode === 'table' || (viewMode === 'auto' && isWide);

  // Pull-to-refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) setPullDistance(Math.min(diff * 0.5, 80));
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60) await refresh();
    setPullDistance(0);
    setIsPulling(false);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen"
      style={{
        transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        transition: isPulling ? 'none' : 'transform 0.3s ease',
      }}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div className={`absolute top-2 left-1/2 -translate-x-1/2 text-xs font-mono px-4 py-1.5 rounded-full z-10 border ${
          pullDistance > 60
            ? 'text-ats-green bg-ats-card border-ats-green'
            : 'text-ats-text-muted bg-ats-card border-ats-border'
        }`}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      <PageShell
        title="Attribution"
        subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${syncAge.text}${refreshing ? ' · syncing...' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode((v) => (v === 'table' ? 'cards' : 'table'))}
              className="bg-ats-border text-ats-text-muted px-3.5 py-2.5 rounded-md text-xs cursor-pointer hover:bg-ats-hover transition-colors"
            >
              {showTable ? 'Cards' : 'Table'}
            </button>
            <ExportButton data={filtered} />
          </div>
        }
      >
        <Filters
          offers={offers}
          accounts={accounts}
          filterOffer={filterOffer}
          filterAccount={filterAccount}
          onOfferChange={setFilterOffer}
          onAccountChange={setFilterAccount}
        />

        <SummaryCards summary={summary} />

        {/* Loading skeleton */}
        {loading && data.length === 0 && (
          <div className="mt-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-ats-card rounded-xl mb-3 animate-pulse"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-5 text-ats-red text-sm">{error}</div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="text-center py-10 text-ats-text-muted">
            <div className="text-base mb-2">No data yet</div>
            <div className="text-sm">
              Waiting for Meta ad sync or webhook data. Seed data should appear on first run.
            </div>
          </div>
        )}

        {/* Data View */}
        <div className="pb-4">
          {filtered.length > 0 && showTable && (
            <MetricsTable
              data={filtered}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}

          {filtered.length > 0 && !showTable && (
            <div className="mt-2">
              {filtered.map((row, i) => (
                <MobileCard
                  key={`${row.offer_name}-${row.account_name}-${i}`}
                  row={row}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Order Feed */}
        <div className="mt-4 mb-4">
          <LiveOrderFeed />
        </div>

        {/* Footer info */}
        <div className="text-center pb-4">
          <div className="text-[10px] text-[#374151] font-mono">
            {filtered.length} rows · auto-refresh 60s
          </div>
        </div>
      </PageShell>
    </div>
  );
}
