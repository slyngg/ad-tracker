import { useEffect, useCallback, useRef } from 'react';
import { useWebSocket, WsMessage } from './useWebSocket';

/**
 * Hook that auto-refreshes page data when WebSocket events arrive.
 * Subscribes to `metrics_update` and `sync_status` events and calls
 * the provided refresh function with debouncing to avoid hammering the API.
 */
export function useLiveRefresh(refresh: () => void, debounceMs = 2000): {
  wsStatus: 'connecting' | 'connected' | 'disconnected';
} {
  const { status, subscribe } = useWebSocket();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const debouncedRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      refreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    const unsub1 = subscribe('metrics_update', debouncedRefresh);
    const unsub2 = subscribe('sync_status', (msg: WsMessage) => {
      // Refresh when any platform finishes syncing
      if (msg.data?.platforms?.some((p: any) => p.status === 'done')) {
        debouncedRefresh();
      }
    });

    return () => {
      unsub1();
      unsub2();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subscribe, debouncedRefresh]);

  return { wsStatus: status };
}
