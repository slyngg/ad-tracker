import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';

const router = Router();

const SYSTEM_PROMPT = `You are OpticData Operator, an AI media buying assistant. You help users analyze their advertising performance, optimize campaigns, and make data-driven decisions. You have access to the user's current metrics and can provide actionable insights about their ad spend, revenue, ROI, CPA, and other key performance indicators. Be concise, data-focused, and proactive with recommendations.`;

// Helper: fetch user's current metrics summary for context
async function getMetricsContext(userId: number | null | undefined): Promise<string> {
  try {
    const [spendResult, revenueResult, topOffersResult] = await Promise.all([
      pool.query(
        'SELECT COALESCE(SUM(spend), 0) AS total_spend, COALESCE(SUM(clicks), 0) AS total_clicks, COALESCE(SUM(impressions), 0) AS total_impressions FROM fb_ads_today WHERE user_id = $1',
        [userId || null]
      ),
      pool.query(
        "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue, COUNT(DISTINCT order_id) AS total_conversions FROM cc_orders_today WHERE order_status = 'completed' AND user_id = $1",
        [userId || null]
      ),
      pool.query(
        "SELECT offer_name, COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed' AND user_id = $1 GROUP BY offer_name ORDER BY revenue DESC LIMIT 5",
        [userId || null]
      ),
    ]);

    const spend = spendResult.rows[0];
    const rev = revenueResult.rows[0];
    const totalSpend = parseFloat(spend.total_spend) || 0;
    const totalRevenue = parseFloat(rev.total_revenue) || 0;
    const totalConversions = parseInt(rev.total_conversions) || 0;
    const roi = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0';
    const cpa = totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : '0';

    const topOffers = topOffersResult.rows.map((r: any) =>
      `  - ${r.offer_name}: $${parseFloat(r.revenue).toFixed(2)} revenue, ${r.conversions} conversions`
    ).join('\n');

    return `
--- Current Metrics (Today) ---
Total Spend: $${totalSpend.toFixed(2)}
Total Revenue: $${totalRevenue.toFixed(2)}
ROI: ${roi}x
Total Conversions: ${totalConversions}
CPA: $${cpa}
Clicks: ${parseInt(spend.total_clicks) || 0}
Impressions: ${parseInt(spend.total_impressions) || 0}
Top Offers:
${topOffers || '  (no data yet)'}
---`;
  } catch (err) {
    console.error('Error fetching metrics context:', err);
    return '--- Metrics context unavailable ---';
  }
}

// POST /api/operator/chat - Send message, stream response via SSE
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { message, conversationId } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Anthropic API key not configured' });
      return;
    }

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const convResult = await pool.query(
        `INSERT INTO operator_conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [userId, message.substring(0, 100)]
      );
      convId = convResult.rows[0].id;
    }

    // Store user message
    await pool.query(
      `INSERT INTO operator_memories (user_id, conversation_id, role, content)
       VALUES ($1, $2, $3, $4)`,
      [userId, convId, 'user', message]
    );

    // Fetch conversation history
    const historyResult = await pool.query(
      `SELECT role, content FROM operator_memories
       WHERE conversation_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [convId, userId]
    );

    const messages = historyResult.rows.map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    // Get metrics context
    const metricsContext = await getMetricsContext(userId);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-Id', String(convId));
    res.flushHeaders();

    // Stream from Anthropic
    const client = new Anthropic({ apiKey });
    let fullResponse = '';

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `${SYSTEM_PROMPT}\n\nHere is the user's current performance data:\n${metricsContext}`,
      messages,
    });

    stream.on('text', (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    stream.on('error', (error) => {
      console.error('Anthropic streaming error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`);
      res.end();
    });

    stream.on('end', async () => {
      // Store assistant response
      try {
        await pool.query(
          `INSERT INTO operator_memories (user_id, conversation_id, role, content)
           VALUES ($1, $2, $3, $4)`,
          [userId, convId, 'assistant', fullResponse]
        );
      } catch (err) {
        console.error('Error storing assistant message:', err);
      }

      res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      stream.abort();
    });
  } catch (err) {
    console.error('Error in operator chat:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process chat message' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal error' })}\n\n`);
      res.end();
    }
  }
});

// GET /api/operator/conversations - List user's conversations
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM operator_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/operator/conversations/:id - Get conversation with messages
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const convResult = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM operator_conversations
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM operator_memories
       WHERE conversation_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [id, userId]
    );

    res.json({
      ...convResult.rows[0],
      messages: messagesResult.rows,
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/operator/conversations - Create new conversation
router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title } = req.body;

    const result = await pool.query(
      `INSERT INTO operator_conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, created_at, updated_at`,
      [userId, title || 'New Conversation']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// DELETE /api/operator/conversations/:id - Delete conversation
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Delete messages first
    await pool.query(
      'DELETE FROM operator_memories WHERE conversation_id = $1 AND user_id = $2',
      [id, userId]
    );

    const result = await pool.query(
      'DELETE FROM operator_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
