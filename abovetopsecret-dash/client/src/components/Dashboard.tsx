import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMetrics } from '../hooks/useMetrics';
import { MetricRow } from '../lib/api';
import SummaryCards from './SummaryCards';
import Filters from './Filters';
import MetricsTable from './MetricsTable';
import MobileCard from './MobileCard';
import ExportButton from './ExportButton';
import SettingsPanel from './SettingsPanel';

interface DashboardProps {
  onUnauthorized: () => void;
}

export default function Dashboard({ onUnauthorized }: DashboardProps) {
  const [filterOffer, setFilterOffer] = useState('All');
  const [filterAccount, setFilterAccount] = useState('All');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, summary, loading, refreshing, error, lastFetched, refresh } = useMetrics(
    undefined, undefined, onUnauthorized
  );

  // Derive unique offers and accounts from data
  const offers = useMemo(() => {
    const set = new Set(data.map((d) => d.offer_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  const accounts = useMemo(() => {
    const set = new Set(data.map((d) => d.account_name));
    return ['All', ...Array.from(set)];
  }, [data]);

  // Filter and sort
  const filtered = useMemo(() => {
    let rows = [...data];

    if (filterOffer !== 'All') {
      rows = rows.filter((r) => r.offer_name === filterOffer);
    }
    if (filterAccount !== 'All') {
      rows = rows.filter((r) => r.account_name === filterAccount);
    }

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

  // Last sync indicator
  const syncAge = useMemo(() => {
    if (!lastFetched) return { text: 'syncing...', color: '#6b7280' };
    const seconds = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (seconds < 60) return { text: `${seconds}s ago`, color: '#6b7280' };
    const minutes = Math.floor(seconds / 60);
    if (minutes > 5) return { text: `${minutes}m ago`, color: '#ef4444' };
    if (minutes > 2) return { text: `${minutes}m ago`, color: '#f59e0b' };
    return { text: `${minutes}m ago`, color: '#6b7280' };
  }, [lastFetched]);

  // Force recalc of sync age every 10 seconds
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
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60) {
      await refresh();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        background: '#030712',
        minHeight: '100vh',
        color: '#f9fafb',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        transition: isPulling ? 'none' : 'transform 0.3s ease',
      }}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          color: pullDistance > 60 ? '#10b981' : '#9ca3af',
          fontFamily: "'JetBrains Mono', monospace",
          background: '#111827',
          padding: '6px 16px',
          borderRadius: 20,
          border: `1px solid ${pullDistance > 60 ? '#10b981' : '#374151'}`,
          zIndex: 10,
        }}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #1f2937' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              <span style={{ color: '#3b82f6' }}>AboveTopSecret</span> Tracker
            </h1>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' '}&bull;{' '}
              <span style={{ color: syncAge.color }}>{syncAge.text}</span>
              {refreshing && <span style={{ color: '#3b82f6', marginLeft: 6 }}>syncing...</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                background: '#1f2937',
                border: 'none',
                color: '#9ca3af',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Settings
            </button>
            <button
              onClick={() => setViewMode((v) => (v === 'table' ? 'cards' : 'table'))}
              style={{
                background: '#1f2937',
                border: 'none',
                color: '#9ca3af',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {showTable ? 'Cards' : 'Table'}
            </button>
            <ExportButton data={filtered} />
          </div>
        </div>

        <Filters
          offers={offers}
          accounts={accounts}
          filterOffer={filterOffer}
          filterAccount={filterAccount}
          onOfferChange={setFilterOffer}
          onAccountChange={setFilterAccount}
        />
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} />

      {/* Loading / Error / Empty states */}
      {loading && data.length === 0 && (
        <div style={{ padding: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              height: 64,
              background: '#111827',
              borderRadius: 12,
              marginBottom: 12,
              opacity: 1 - i * 0.12,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', padding: 20, color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>No data yet</div>
          <div style={{ fontSize: 13 }}>
            Waiting for Facebook ad sync or webhook data. Seed data should appear on first run.
          </div>
        </div>
      )}

      {/* Data View */}
      <div style={{ padding: '0 16px 80px' }}>
        {filtered.length > 0 && showTable && (
          <MetricsTable
            data={filtered}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}

        {filtered.length > 0 && !showTable && (
          <div style={{ marginTop: 8 }}>
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

      {/* Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(transparent, #030712 30%)',
        padding: '20px 16px 12px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, color: '#374151', fontFamily: "'JetBrains Mono', monospace" }}>
          AboveTopSecret PROPRIETARY &bull; {filtered.length} rows &bull; auto-refresh 60s
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        offers={offers}
        onSaved={refresh}
      />
    </div>
  );
}
