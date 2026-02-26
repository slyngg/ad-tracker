import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { operatorTools, executeTool, getPendingActionsForUser } from '../services/operator-tools';

const router = Router();

const SYSTEM_PROMPT = `You are OpticData Operator, an AI media buying assistant with tool-calling capabilities. You help users analyze their advertising performance, optimize campaigns, and make data-driven decisions.

You have access to tools that can:

**Metrics & Analytics:**
- Pull real-time campaign, adset, and order metrics (filterable by platform: meta, tiktok, newsbreak)
- Calculate ROAS by campaign
- Show traffic source breakdowns
- List all ad accounts and offers with today's performance summary
- Run custom SQL queries
- Query historical ad performance data

**Ad Platform Actions (Meta/Facebook):**
- Pause/enable Meta adsets (pause_meta_adset, enable_meta_adset)
- Adjust Meta adset budgets — absolute $ or percentage increase/decrease (adjust_meta_budget)
- Pause/enable entire Meta campaigns (pause_meta_campaign, enable_meta_campaign)
ALL ad platform tools accept EITHER a numeric ID OR a name. When the user refers to an entity by name (e.g. "pause Collagen Broad", "increase budget on Spring Launch"), pass the name in the \`name\` parameter — the system resolves it to the correct ID automatically. If the name matches multiple entities, the system returns suggestions for the user to pick from.

**Ad Platform Actions (TikTok):**
- Pause/enable TikTok ad groups (pause_tiktok_adgroup, enable_tiktok_adgroup)
- Adjust TikTok ad group budgets — absolute $ or percentage (adjust_tiktok_budget)
- Pause/enable entire TikTok campaigns (pause_tiktok_campaign, enable_tiktok_campaign)

**Checkout Champ Actions:**
- Pause subscriptions (pause_cc_subscription)
- Cancel subscriptions (cancel_cc_subscription)

**Automation Rules Engine:**
- List all rules with full details, execution stats, and status (list_rules)
- Create rules with metric thresholds (single or compound AND/OR conditions), platform/campaign scoping, and 21 action types across Meta, TikTok, CC, and notifications (create_rule)
- Update existing rules (update_rule)
- Delete rules (delete_rule)
- Enable/disable rules (toggle_rule)
- View rule execution logs (get_rule_logs)

Available rule metrics: spend, revenue, roas, cpa, conversions, clicks, impressions, ctr, cvr, aov, profit, profit_margin
Available rule actions: notification, email_notify, slack_notify, webhook, flag_review, pause_adset, enable_adset, adjust_budget, increase_budget_pct, decrease_budget_pct, pause_campaign, enable_campaign, pause_tiktok_adgroup, enable_tiktok_adgroup, adjust_tiktok_budget, increase_tiktok_budget_pct, decrease_tiktok_budget_pct, pause_tiktok_campaign, enable_tiktok_campaign, pause_cc_subscription, cancel_cc_subscription

**Creative Analysis:**
- Query ad creative performance metrics and analyze creative diversity
- Recommend next creatives to produce based on winning patterns
- Score ad concepts before launch against historical data
- Run weekly creative retrospectives
- Analyze competitor creative strategies
- Detect statistically significant winning creative patterns

Multi-Account Context: Users may manage multiple ad accounts and offers. Use list_accounts_and_offers to see all their accounts and offers. Most data tools accept an optional account_id parameter to filter results to a specific account, and order tools accept offer_id to filter by offer. When the user asks about a specific client, brand, or account, use list_accounts_and_offers first to find the right account_id, then pass it to subsequent tool calls.

Always use tools to get fresh data rather than relying on the summary context alone. When asked about metrics, campaigns, or performance, call the appropriate tool first, then analyze the results.

**CRITICAL — Write Action Confirmation Flow:**
All write actions (pause, enable, budget changes, subscription changes) are programmatically gated. When you call any write tool, it returns one of two statuses:

**Status: \`not_found\`** — The ID doesn't match any entity. The result includes \`suggestions\` (an array of { option, id, name, spend }). Present these as a numbered list and ask: "Did you mean one of these?" When the user picks one (by number, name, or ID), re-call the write tool with the CORRECT id from the suggestion. Do NOT guess — use the exact id from the suggestions array.

**Status: \`pending_confirmation\`** — The ID is valid. The result includes a \`pending_id\` and a human-readable \`description\` of exactly what will happen (including the entity name). Present the EXACT \`description\` to the user and ask them to say "confirm". When the user confirms, call \`confirm_action\` with the \`pending_id\`. If they say no/cancel, call \`cancel_action\` with the \`pending_id\`.

NEVER skip the confirmation. NEVER call confirm_action without the user explicitly confirming. Pending actions expire after 5 minutes.

When creating automation rules, use appropriate cooldowns: 60 min for notifications, 120+ min for budget changes and platform actions. Always explain what the rule will do before creating it.

Be concise, data-focused, and proactive with recommendations. Format responses with markdown tables when presenting data.

**Data Visualization:**
After fetching data with analytics tools, use render_chart to visualize results inline.
- "kpi" type: summary stats (today's revenue, ROAS, conversions, CPA)
- "line" or "area" type: timeseries trends (performance over days/weeks)
- "bar" type: comparing campaigns, adsets, offers, or creatives
- "pie" type: share/breakdown of spend or revenue by category
Always also provide a brief text summary alongside the chart.
In voice mode, skip render_chart and describe data verbally.

When the user is using voice input (indicated by the conversation context), keep responses concise and conversational. Prefer short sentences. Avoid markdown tables in voice mode — use natural language instead.`;

// Helper: fetch user's current metrics summary for context
async function getMetricsContext(userId: number | null | undefined): Promise<string> {
  try {
    const [spendResult, revenueResult, topOffersResult] = await Promise.all([
      pool.query(
        `WITH all_ads AS (
          SELECT spend, clicks, impressions FROM fb_ads_today WHERE user_id = $1
          UNION ALL
          SELECT spend, clicks, impressions FROM tiktok_ads_today WHERE user_id = $1
          UNION ALL
          SELECT spend, clicks, impressions FROM newsbreak_ads_today WHERE user_id = $1
        )
        SELECT COALESCE(SUM(spend), 0) AS total_spend, COALESCE(SUM(clicks), 0) AS total_clicks, COALESCE(SUM(impressions), 0) AS total_impressions FROM all_ads`,
        [userId || null]
      ),
      pool.query(
        "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue, COUNT(DISTINCT order_id) AS total_conversions FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1",
        [userId || null]
      ),
      pool.query(
        "SELECT offer_name, COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1 GROUP BY offer_name ORDER BY revenue DESC LIMIT 5",
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

// Helper: fetch automation rules context for system prompt
async function getRulesContext(userId: number | null | undefined): Promise<string> {
  if (!userId) return '';
  try {
    const result = await pool.query(
      `SELECT r.id, r.name, r.trigger_type, r.trigger_config, r.action_type, r.action_meta, r.cooldown_minutes, r.enabled, r.last_fired_at,
        (SELECT COUNT(*) FROM rule_execution_log WHERE rule_id = r.id AND status = 'success' AND triggered_at > NOW() - INTERVAL '24 hours') as fires_24h,
        (SELECT COUNT(*) FROM rule_execution_log WHERE rule_id = r.id AND status = 'failure' AND triggered_at > NOW() - INTERVAL '24 hours') as errors_24h
       FROM automation_rules r WHERE r.user_id = $1 ORDER BY r.id`,
      [userId]
    );
    if (result.rows.length === 0) return '\n\n## Automation Rules\nNo automation rules configured.';

    const rulesText = result.rows.map((r: any) => {
      const tc = r.trigger_config || {};
      const am = r.action_meta || {};
      const platform = tc.platform && tc.platform !== 'all' ? `[${tc.platform}] ` : '';
      const campaign = tc.campaign_name ? ` (campaign: ${tc.campaign_name})` : '';

      let triggerStr: string;
      if (r.trigger_type === 'compound' && tc.conditions?.length) {
        const parts = tc.conditions.map((c: any) => `${c.metric} ${c.operator} ${c.value}`);
        triggerStr = `${platform}${parts.join(` ${tc.logic || 'AND'} `)}${campaign}`;
      } else {
        triggerStr = tc.metric
          ? `${platform}${tc.metric} ${tc.operator || '>'} ${tc.value}${campaign}`
          : JSON.stringify(tc);
      }

      const status = r.enabled ? 'ENABLED' : 'DISABLED';
      const lastFired = r.last_fired_at ? new Date(r.last_fired_at).toISOString() : 'never';
      const targetId = am.adset_id || am.adgroup_id || am.campaign_id || am.purchase_id || '';
      const targetStr = targetId ? ` target: ${targetId}` : '';
      const cooldown = r.cooldown_minutes ? ` cooldown: ${r.cooldown_minutes}m` : '';

      return `- [${r.id}] "${r.name}" (${status}) — IF ${triggerStr} THEN ${r.action_type}${targetStr}${cooldown}, last fired: ${lastFired}, 24h: ${r.fires_24h} ok / ${r.errors_24h} err`;
    }).join('\n');

    return `\n\n## Automation Rules\n${rulesText}`;
  } catch (err) {
    console.error('Error fetching rules context:', err);
    return '';
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

    // ── Programmatic confirmation shortcut ──
    // If user says "confirm"/"yes"/"cancel" and there are pending write actions,
    // execute them directly without an AI roundtrip
    const CONFIRM_PATTERN = /^\s*(confirm|yes|yep|yup|yeah|yea|sure|ok|okay|do it|go ahead|proceed|execute|approved?|absolutely|definitely|kk)\s*[.!]?\s*$/i;
    const CANCEL_PATTERN = /^\s*(no|nah|nope|cancel|nevermind|never mind|abort|stop|don't|dont|scratch that)\s*[.!]?\s*$/i;
    const pendingUserActions = getPendingActionsForUser(userId ?? null);

    if (pendingUserActions.length > 0 && (CONFIRM_PATTERN.test(message) || CANCEL_PATTERN.test(message))) {
      const isConfirm = CONFIRM_PATTERN.test(message);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Conversation-Id', String(convId));
      res.flushHeaders();

      const results: string[] = [];
      for (const action of pendingUserActions) {
        const toolName = isConfirm ? 'confirm_action' : 'cancel_action';
        try {
          const { summary } = await executeTool(toolName, { pending_id: action.id }, userId ?? null);
          results.push(isConfirm ? `✅ ${summary}` : summary);
          res.write(`data: ${JSON.stringify({ type: 'tool_status', tool: action.tool, status: 'done', summary })}\n\n`);
        } catch (err: any) {
          results.push(`❌ Failed: ${err.message}`);
          res.write(`data: ${JSON.stringify({ type: 'tool_status', tool: action.tool, status: 'error', summary: err.message })}\n\n`);
        }
      }

      const responseText = results.join('\n');
      const chunkSize = 20;
      for (let i = 0; i < responseText.length; i += chunkSize) {
        res.write(`data: ${JSON.stringify({ type: 'text', text: responseText.slice(i, i + chunkSize) })}\n\n`);
      }

      // Store assistant response
      await pool.query(
        `INSERT INTO operator_memories (user_id, conversation_id, role, content) VALUES ($1, $2, $3, $4)`,
        [userId, convId, 'assistant', responseText]
      );

      res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
      res.end();
      return;
    }

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

    // Get metrics context, rules context, and long-term memories
    const [metricsContext, rulesContext, memories] = await Promise.all([
      getMetricsContext(userId),
      getRulesContext(userId),
      getLongTermMemories(userId),
    ]);

    const systemPrompt = `${SYSTEM_PROMPT}\n\nHere is the user's current performance data:\n${metricsContext}${rulesContext}${memories}`;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-Id', String(convId));
    res.flushHeaders();

    const client = new Anthropic({ apiKey });
    let currentMessages = [...messages];
    let aborted = false;
    const collectedCharts: any[] = [];

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
          const { result, summary, chartSpec } = await executeTool(toolBlock.name, toolBlock.input, userId ?? null);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });

          // Emit chart SSE event if present
          if (chartSpec) {
            collectedCharts.push(chartSpec);
            res.write(`data: ${JSON.stringify({ type: 'chart', chart: chartSpec })}\n\n`);
          }

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
        const metadata = collectedCharts.length > 0 ? JSON.stringify({ charts: collectedCharts }) : null;
        await pool.query(
          `INSERT INTO operator_memories (user_id, conversation_id, role, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, convId, 'assistant', fullResponse, metadata]
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
      `SELECT id, role, content, metadata, created_at
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

// GET /api/operator/memories - List all long-term memories for the authenticated user
router.get('/memories', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, 'general' AS category, fact AS content, 1.0 AS confidence, created_at
       FROM operator_long_term_memory
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching memories:', err);
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

// DELETE /api/operator/memories - Delete all memories for the authenticated user
router.delete('/memories', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'DELETE FROM operator_long_term_memory WHERE user_id = $1',
      [userId]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('Error clearing memories:', err);
    res.status(500).json({ error: 'Failed to clear memories' });
  }
});

// DELETE /api/operator/memories/:id - Delete a specific memory
router.delete('/memories/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM operator_long_term_memory WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting memory:', err);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
