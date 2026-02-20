import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, WsMessage } from '../../hooks/useWebSocket';

interface Order {
  orderId: string;
  offerName: string;
  revenue: number;
  status: string;
  createdAt: string;
}

export default function LiveOrderFeed() {
  const [orders, setOrders] = useState<Order[]>([]);
  const { subscribe } = useWebSocket();

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

  if (orders.length === 0) {
    return (
      <div className="bg-ats-card border border-ats-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-ats-text mb-3">Live Orders</h3>
        <div className="text-xs text-ats-text-muted text-center py-4">
          Waiting for orders...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <h3 className="text-sm font-bold text-ats-text mb-3">Live Orders</h3>
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
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <span className="font-mono text-ats-green font-semibold">
                ${order.revenue.toFixed(2)}
              </span>
              <span className="text-ats-text-muted">
                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
