import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMetrics, fetchSummary, MetricRow, SummaryData } from '../lib/api';
import { useWebSocket, WsMessage } from './useWebSocket';
import { useAccountStore } from '../stores/accountStore';

interface UseMetricsReturn {
  data: MetricRow[];
  summary: SummaryData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastFetched: Date | null;
  refresh: () => Promise<void>;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
}

export function useMetrics(
  offer?: string,
  account?: string,
  onUnauthorized?: () => void
): UseMetricsReturn {
  const [data, setData] = useState<MetricRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoaded = useRef(false);

  const { status: wsStatus, subscribe } = useWebSocket();
  const selectedAccountIds = useAccountStore((s) => s.selectedAccountIds);
  const selectedOfferIds = useAccountStore((s) => s.selectedOfferIds);

  const refresh = useCallback(async () => {
    try {
      if (hasLoaded.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [metricsData, summaryData] = await Promise.all([
        fetchMetrics(offer, account),
        fetchSummary(),
      ]);
      setData(metricsData);
      setSummary(summaryData);
      setLastFetched(new Date());
      setError(null);
      hasLoaded.current = true;
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [offer, account, onUnauthorized, selectedAccountIds, selectedOfferIds]);

  // Subscribe to WS events for live summary updates
  useEffect(() => {
    const unsubMetrics = subscribe('metrics_update', (msg: WsMessage) => {
      if (msg.data) {
        setSummary(msg.data);
        setLastFetched(new Date());
      }
    });

    const unsubSnapshot = subscribe('snapshot', (msg: WsMessage) => {
      if (msg.data?.summary) {
        setSummary(msg.data.summary);
        setLastFetched(new Date());
      }
    });

    // On override change, do a full refresh to get recalculated metrics
    const unsubOverride = subscribe('override_change', () => {
      refresh();
    });

    return () => { unsubMetrics(); unsubSnapshot(); unsubOverride(); };
  }, [subscribe, refresh]);

  useEffect(() => {
    refresh();

    // Fallback polling: 120s when WS is connected, 60s when disconnected
    const interval = wsStatus === 'connected' ? 120000 : 60000;
    intervalRef.current = setInterval(refresh, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh, wsStatus]);

  return { data, summary, loading, refreshing, error, lastFetched, refresh, wsStatus };
}
