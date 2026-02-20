import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMetrics, fetchSummary, MetricRow, SummaryData } from '../lib/api';

interface UseMetricsReturn {
  data: MetricRow[];
  summary: SummaryData | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  refresh: () => Promise<void>;
}

export function useMetrics(
  offer?: string,
  account?: string,
  onUnauthorized?: () => void
): UseMetricsReturn {
  const [data, setData] = useState<MetricRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [metricsData, summaryData] = await Promise.all([
        fetchMetrics(offer, account),
        fetchSummary(),
      ]);
      setData(metricsData);
      setSummary(summaryData);
      setLastFetched(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, [offer, account, onUnauthorized]);

  useEffect(() => {
    refresh();

    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(refresh, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  return { data, summary, loading, error, lastFetched, refresh };
}
