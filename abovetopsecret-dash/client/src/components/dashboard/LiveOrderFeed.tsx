import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, WsMessage } from '../../hooks/useWebSocket';

interface Order {
  orderId: string;
  offerName: string;
  revenue: number;
  status: string;
  createdAt: string;
  newCustomer?: boolean;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function LiveOrderFeed() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setTick] = useState(0);
  const { subscribe, status } = useWebSocket();

  const handleNewOrder = useCallback((msg: WsMessage) => {
    const order: Order = msg.data;
    setOrders((prev) => [order, ...prev].slice(0, 50));
  }, []);

  const handleSnapshot = useCallback((msg: WsMessage) => {
    if (msg.data?.recentOrders) {
      setOrders(msg.data.recentOrders);
    }
  }, []);

  useEffect(() => {
    const unsub1 = subscribe('new_order', handleNewOrder);
    const unsub2 = subscribe('snapshot', handleSnapshot);
    return () => { unsub1(); unsub2(); };
  }, [subscribe, handleNewOrder, handleSnapshot]);

  // Re-render every 30s to keep relative timestamps fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = status === 'connected';

  if (orders.length === 0) {
    return (
      <div className="bg-ats-card border border-ats-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ats-text">Live Orders</h3>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-ats-text-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-ats-green animate-pulse' : 'bg-ats-text-muted'}`} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <div className="text-xs text-ats-text-muted text-center py-4">
          Waiting for orders...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ats-text">Live Orders</h3>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-ats-text-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-ats-green animate-pulse' : 'bg-ats-text-muted'}`} />
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {orders.map((order, i) => (
          <div
            key={`${order.orderId}-${i}`}
            className={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${
              i === 0 ? 'bg-ats-accent/10 animate-pulse-once' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                order.status === 'completed' ? 'bg-ats-green' :
                order.status === 'refunded' ? 'bg-ats-red' : 'bg-yellow-400'
              }`} />
              <span className="text-ats-text truncate">{order.offerName}</span>
              {order.newCustomer && (
                <span className="px-1.5 py-0.5 rounded bg-ats-green/15 text-ats-green text-[10px] font-semibold flex-shrink-0">
                  NEW
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <span className="font-mono text-ats-green font-semibold">
                ${order.revenue.toFixed(2)}
              </span>
              <span className="text-ats-text-muted" title={new Date(order.createdAt).toLocaleTimeString()}>
                {timeAgo(order.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
