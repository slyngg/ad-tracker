import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { operatorTools, executeTool } from '../services/operator-tools';

const router = Router();

const SYSTEM_PROMPT = `You are OpticData Operator, an AI media buying assistant with tool-calling capabilities. You help users analyze their advertising performance, optimize campaigns, and make data-driven decisions.

You have access to tools that can:
- Pull real-time campaign, adset, and order metrics
- Calculate ROAS by campaign
- Show traffic source breakdowns
- Pause/enable Meta adsets and adjust budgets
- Run custom SQL queries

Always use tools to get fresh data rather than relying on the summary context alone. When asked about metrics, campaigns, or performance, call the appropriate tool first, then analyze the results.

For Meta write actions (pause, enable, budget changes), confirm the action with the user before executing.

Be concise, data-focused, and proactive with recommendations. Format responses with markdown tables when presenting data.`;

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
--- Current Metrics Summary (Today) ---
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

// Helper: fetch long-term memories for user
async function getLongTermMemories(userId: number | null | undefined): Promise<string> {
  if (!userId) return '';
  try {
    const result = await pool.query(
      'SELECT fact FROM operator_long_term_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    if (result.rows.length === 0) return '';
    const facts = result.rows.map((r: any) => `- ${r.fact}`).join('\n');
    return `\n\nThings you remember about this user:\n${facts}`;
  } catch {
    return '';
  }
}

// Helper: extract memories from conversation (every 5th message)
async function maybeExtractMemories(
  conversationId: number,
  userId: number | null | undefined,
  apiKey: string
): Promise<void> {
  if (!userId) return;
  try {
    const countResult = await pool.query(
      'SELECT COUNT(*) AS cnt FROM operator_memories WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    const messageCount = parseInt(countResult.rows[0].cnt) || 0;
    if (messageCount % 5 !== 0 || messageCount === 0) return;

    // Get recent messages for extraction
    const messagesResult = await pool.query(
      `SELECT role, content FROM operator_memories
       WHERE conversation_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 10`,
      [conversationId, userId]
    );

    const recentConvo = messagesResult.rows.reverse().map((r: any) =>
      `${r.role}: ${r.content.slice(0, 500)}`
    ).join('\n');

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Extract 0-3 factual preferences or key decisions from this conversation that would be useful to remember for future conversations. Return a JSON array of strings, or empty array if nothing worth remembering.\n\nConversation:\n${recentConvo}`,
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;

    const facts: string[] = JSON.parse(match[0]);
    for (const fact of facts) {
      if (fact && fact.trim()) {
        await pool.query(
          'INSERT INTO operator_long_term_memory (user_id, fact) VALUES ($1, $2)',
          [userId, fact.trim()]
        );
      }
    }
  } catch (err) {
    console.error('Error extracting memories:', err);
  }
}

// POST /api/operator/chat - Send message, stream response via SSE with tool-use loop
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

    const messages: Anthropic.MessageParam[] = historyResult.rows.map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    // Get metrics context and long-term memories
    const [metricsContext, memories] = await Promise.all([
      getMetricsContext(userId),
      getLongTermMemories(userId),
    ]);

    const systemPrompt = `${SYSTEM_PROMPT}\n\nHere is the user's current performance data:\n${metricsContext}${memories}`;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-Id', String(convId));
    res.flushHeaders();

    const client = new Anthropic({ apiKey });
    let currentMessages = [...messages];
    let aborted = false;

    req.on('close', () => {
      aborted = true;
    });

    // Tool-use loop: non-streaming calls until no more tool_use
    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
      tools: operatorTools,
    });

    while (response.stop_reason === 'tool_use' && !aborted) {
      // Extract tool_use blocks
      const toolUseBlocks = response.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => block as any as { type: 'tool_use'; id: string; name: string; input: Record<string, any> });

      // Append assistant message with tool_use blocks to conversation
      currentMessages.push({ role: 'assistant', content: response.content as any });

      const toolResults: any[] = [];

      for (const toolBlock of toolUseBlocks) {
        // Send tool_status running event
        res.write(`data: ${JSON.stringify({ type: 'tool_status', tool: toolBlock.name, status: 'running' })}\n\n`);

        try {
          const { result, summary } = await executeTool(toolBlock.name, toolBlock.input, userId ?? null);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });

          // Send tool_status done event
          res.write(`data: ${JSON.stringify({ type: 'tool_status', tool: toolBlock.name, status: 'done', summary })}\n\n`);
        } catch (err: any) {
          const errorMsg = err.message || 'Tool execution failed';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: errorMsg }),
            is_error: true,
          });
          res.write(`data: ${JSON.stringify({ type: 'tool_status', tool: toolBlock.name, status: 'error', summary: errorMsg })}\n\n`);
        }
      }

      // Append tool results as user message
      currentMessages.push({ role: 'user', content: toolResults });

      // Next iteration
      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: currentMessages,
        tools: operatorTools,
      });
    }

    if (aborted) {
      res.end();
      return;
    }

    // Final response: stream the text content
    // Extract any text from the non-streaming response first
    let fullResponse = '';

    // If the final response has text content, stream it
    const textBlocks = response.content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      // Use streaming for the final text response for better UX
      const finalMessages = [...currentMessages];

      // If we already have text content from non-streaming, just send it
      for (const block of textBlocks) {
        if (block.type === 'text') {
          fullResponse += block.text;
        }
      }

      // Stream the text in chunks for smoother UX
      const chunkSize = 20;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        if (aborted) break;
        const chunk = fullResponse.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`);
      }
    }

    // Store assistant response
    if (fullResponse) {
      try {
        await pool.query(
          `INSERT INTO operator_memories (user_id, conversation_id, role, content)
           VALUES ($1, $2, $3, $4)`,
          [userId, convId, 'assistant', fullResponse]
        );

        // Maybe extract long-term memories
        maybeExtractMemories(convId, userId, apiKey).catch(() => {});
      } catch (err) {
        console.error('Error storing assistant message:', err);
      }

      // Generate follow-up suggestions via Haiku (non-blocking)
      if (!aborted) {
        try {
          const suggestionsResponse = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Based on this AI assistant response about advertising/campaign data, generate 2-3 short follow-up questions the user might want to ask next. Return ONLY a JSON array of strings, nothing else.\n\nAssistant response:\n${fullResponse.slice(0, 1000)}`,
            }],
          });
          const sugText = suggestionsResponse.content[0]?.type === 'text' ? suggestionsResponse.content[0].text : '';
          const sugMatch = sugText.match(/\[[\s\S]*\]/);
          if (sugMatch) {
            const suggestions: string[] = JSON.parse(sugMatch[0]);
            if (suggestions.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'suggestions', suggestions: suggestions.slice(0, 3) })}\n\n`);
            }
          }
        } catch (err) {
          // Non-blocking — client falls back to static suggestions
          console.error('Error generating follow-up suggestions:', err);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
    res.end();
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
