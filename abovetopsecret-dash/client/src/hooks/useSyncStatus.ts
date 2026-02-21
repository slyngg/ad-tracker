import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, WsMessage } from './useWebSocket';

export interface PlatformSyncState {
  platform: string;
  status: 'idle' | 'syncing' | 'done' | 'error';
}

export interface SyncState {
  isSyncing: boolean;
  platforms: PlatformSyncState[];
  allDone: boolean;
}

/**
 * Tracks real-time sync progress via WebSocket `sync_status` events.
 * Used by the preloader/skeleton UI to show per-platform progress.
 */
export function useSyncStatus(): SyncState {
  const [platforms, setPlatforms] = useState<PlatformSyncState[]>([]);
  const [allDone, setAllDone] = useState(false);
  const { subscribe } = useWebSocket();

  const handleSyncStatus = useCallback((msg: WsMessage) => {
    const data = msg.data as {
      status: 'syncing' | 'complete';
      platforms: { platform: string; status: 'syncing' | 'done' | 'error' }[];
    };

    setPlatforms((prev) => {
      const updated = [...prev];
      for (const incoming of data.platforms) {
        const idx = updated.findIndex((p) => p.platform === incoming.platform);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], status: incoming.status };
        } else {
          updated.push({ platform: incoming.platform, status: incoming.status });
        }
      }
      return updated;
    });

    if (data.status === 'complete') {
      setAllDone(true);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe('sync_status', handleSyncStatus);
    return unsub;
  }, [subscribe, handleSyncStatus]);

  const isSyncing = platforms.some((p) => p.status === 'syncing');

  return { isSyncing, platforms, allDone };
}
