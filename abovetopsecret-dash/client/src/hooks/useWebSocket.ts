import { useEffect, useRef, useCallback, useState } from 'react';
import { getAuthToken } from '../stores/authStore';

export type WsEventType =
  | 'snapshot'
  | 'metrics_update'
  | 'new_order'
  | 'override_change'
  | 'notification'
  | 'rule_execution'
  | 'sync_status'
  | 'error';

export interface WsMessage {
  type: WsEventType;
  data: any;
  ts: string;
}

type WsHandler = (msg: WsMessage) => void;

interface UseWebSocketReturn {
  status: 'connecting' | 'connected' | 'disconnected';
  subscribe: (type: WsEventType, handler: WsHandler) => () => void;
  requestSnapshot: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<WsEventType, Set<WsHandler>>>(new Map());
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      setStatus('disconnected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        const handlers = handlersRef.current.get(msg.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(msg);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;

      // Exponential backoff reconnect: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
      reconnectAttempt.current++;
      reconnectTimeout.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const subscribe = useCallback((type: WsEventType, handler: WsHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const requestSnapshot = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_snapshot' }));
    }
  }, []);

  return { status, subscribe, requestSnapshot };
}
