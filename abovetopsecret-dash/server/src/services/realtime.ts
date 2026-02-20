import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET } from '../routes/auth';
import { refreshPinnedDashboards } from './slack-bot';

interface AuthenticatedSocket extends WebSocket {
  userId: number | null;
  isAlive: boolean;
}

type WsEventType =
  | 'snapshot'
  | 'metrics_update'
  | 'new_order'
  | 'override_change'
  | 'notification'
  | 'rule_execution'
  | 'error';

interface WsMessage {
  type: WsEventType;
  data: any;
  ts: string;
}

let instance: RealtimeService | null = null;

export class RealtimeService {
  private wss: WebSocketServer;
  private pool: Pool;
  private clients: Map<number | null, Set<AuthenticatedSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer, pool: Pool) {
    this.pool = pool;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', async (ws: WebSocket, req) => {
      const socket = ws as AuthenticatedSocket;
      socket.isAlive = true;

      // Authenticate from URL query params: ?token=JWT or ?apiKey=KEY
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const apiKey = url.searchParams.get('apiKey');

      let userId: number | null = null;

      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
          userId = payload.userId;
        } catch {
          socket.close(4001, 'Invalid token');
          return;
        }
      } else if (apiKey) {
        try {
          const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
          const result = await pool.query(
            'SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
            [keyHash]
          );
          if (result.rows.length > 0) {
            userId = result.rows[0].user_id;
            await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1', [keyHash]);
          } else {
            socket.close(4001, 'Invalid API key');
            return;
          }
        } catch {
          socket.close(4001, 'Auth error');
          return;
        }
      } else {
        socket.close(4001, 'No authentication provided');
        return;
      }

      socket.userId = userId;

      // Register client
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId)!.add(socket);

      // Handle pong
      socket.on('pong', () => {
        socket.isAlive = true;
      });

      // Handle close
      socket.on('close', () => {
        const userClients = this.clients.get(socket.userId);
        if (userClients) {
          userClients.delete(socket);
          if (userClients.size === 0) {
            this.clients.delete(socket.userId);
          }
        }
      });

      // Handle incoming messages (client can request snapshot)
      socket.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'request_snapshot') {
            const snapshot = await this.fetchSnapshot(socket.userId);
            this.send(socket, { type: 'snapshot', data: snapshot, ts: new Date().toISOString() });
          }
        } catch {
          // Ignore malformed messages
        }
      });

      // Send initial snapshot
      try {
        const snapshot = await this.fetchSnapshot(userId);
        this.send(socket, { type: 'snapshot', data: snapshot, ts: new Date().toISOString() });
      } catch (err) {
        console.error('[Realtime] Error sending initial snapshot:', err);
      }
    });

    // Heartbeat: ping every 30s, terminate dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const socket = ws as AuthenticatedSocket;
        if (!socket.isAlive) {
          socket.terminate();
          return;
        }
        socket.isAlive = false;
        socket.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
    });
  }

  private send(socket: AuthenticatedSocket, msg: WsMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  private broadcast(userId: number | null, msg: WsMessage): void {
    const userClients = this.clients.get(userId);
    if (!userClients) return;
    for (const socket of userClients) {
      this.send(socket, msg);
    }
  }

  // --- Data fetchers ---

  private async fetchSnapshot(userId: number | null): Promise<any> {
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const [summaryResult, recentOrdersResult] = await Promise.all([
      this.pool.query(`
        SELECT
          (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today ${uf ? 'WHERE user_id = $1' : ''}) AS total_spend,
          (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}) AS total_revenue,
          (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}) AS total_conversions
      `, params),
      this.pool.query(`
        SELECT order_id, offer_name, COALESCE(subtotal, revenue) AS revenue, order_status, conversion_time
        FROM cc_orders_today
        WHERE 1=1 ${ufAnd}
        ORDER BY conversion_time DESC
        LIMIT 20
      `, params),
    ]);

    const row = summaryResult.rows[0];
    const totalSpend = parseFloat(row.total_spend) || 0;
    const totalRevenue = parseFloat(row.total_revenue) || 0;

    return {
      summary: {
        total_spend: totalSpend,
        total_revenue: totalRevenue,
        total_roi: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        total_conversions: parseInt(row.total_conversions) || 0,
      },
      recentOrders: recentOrdersResult.rows.map((r: any) => ({
        orderId: r.order_id,
        offerName: r.offer_name,
        revenue: parseFloat(r.revenue) || 0,
        status: r.order_status,
        createdAt: r.conversion_time,
      })),
    };
  }

  private async fetchSummary(userId: number | null): Promise<any> {
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await this.pool.query(`
      SELECT
        (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today ${uf ? 'WHERE user_id = $1' : ''}) AS total_spend,
        (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}) AS total_revenue,
        (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}) AS total_conversions
    `, params);

    const row = result.rows[0];
    const totalSpend = parseFloat(row.total_spend) || 0;
    const totalRevenue = parseFloat(row.total_revenue) || 0;

    return {
      total_spend: totalSpend,
      total_revenue: totalRevenue,
      total_roi: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      total_conversions: parseInt(row.total_conversions) || 0,
    };
  }

  // --- Public emit methods ---

  async emitNewOrder(userId: number | null, order: {
    orderId: string;
    offerName: string;
    revenue: number;
    status: string;
  }): Promise<void> {
    // Send the new order event
    this.broadcast(userId, {
      type: 'new_order',
      data: { ...order, createdAt: new Date().toISOString() },
      ts: new Date().toISOString(),
    });

    // Also send updated summary
    try {
      const summary = await this.fetchSummary(userId);
      this.broadcast(userId, {
        type: 'metrics_update',
        data: summary,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Realtime] Error fetching summary after new order:', err);
    }

    // Refresh Slack pinned dashboards
    refreshPinnedDashboards(userId);
  }

  async emitMetricsUpdate(userId: number | null): Promise<void> {
    try {
      const summary = await this.fetchSummary(userId);
      this.broadcast(userId, {
        type: 'metrics_update',
        data: summary,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Realtime] Error emitting metrics update:', err);
    }

    // Refresh Slack pinned dashboards
    refreshPinnedDashboards(userId);
  }

  emitOverrideChange(userId: number | null): void {
    this.broadcast(userId, {
      type: 'override_change',
      data: {},
      ts: new Date().toISOString(),
    });
  }

  emitNotification(userId: number | null, notification: { id?: number; title: string; message: string }): void {
    this.broadcast(userId, {
      type: 'notification',
      data: notification,
      ts: new Date().toISOString(),
    });
  }

  emitRuleExecution(userId: number | null, execution: { ruleId: number; ruleName: string; action: string; detail?: any }): void {
    this.broadcast(userId, {
      type: 'rule_execution',
      data: execution,
      ts: new Date().toISOString(),
    });
  }

  getConnectionCount(): number {
    let count = 0;
    for (const clients of this.clients.values()) {
      count += clients.size;
    }
    return count;
  }
}

export function initRealtime(server: HttpServer, pool: Pool): RealtimeService {
  instance = new RealtimeService(server, pool);
  console.log('[Realtime] WebSocket server initialized on /ws');
  return instance;
}

export function getRealtime(): RealtimeService | null {
  return instance;
}
