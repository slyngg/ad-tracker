import { App, LogLevel } from '@slack/bolt';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';

let slackApp: App | null = null;

async function fetchMetricsForSlack(userId: number | null): Promise<{
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  conversions: number;
}> {
  const uf = userId ? 'WHERE user_id = $1' : '';
  const ufAnd = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const [adsResult, ordersResult] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(spend), 0) AS spend FROM fb_ads_today ${uf}`, params),
    pool.query(`
      SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
             COUNT(DISTINCT order_id) AS conversions
      FROM cc_orders_today WHERE order_status = 'completed' ${ufAnd}
    `, params),
  ]);

  const spend = parseFloat(adsResult.rows[0].spend) || 0;
  const revenue = parseFloat(ordersResult.rows[0].revenue) || 0;
  const conversions = parseInt(ordersResult.rows[0].conversions) || 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  return { spend, revenue, roas, cpa, conversions };
}

// Resolve Slack user to OpticData userId via linked settings
async function resolveSlackUser(_slackUserId: string): Promise<number | null> {
  // Default: use first user (single-tenant) or return null
  // In production, you'd link Slack users to OpticData users via a settings table
  try {
    const result = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
    return result.rows[0]?.id || null;
  } catch {
    return null;
  }
}

function fmt(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}

export function initSlackBot(): void {
  const token = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!token || !signingSecret) {
    console.log('[Slack Bot] SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set, skipping init');
    return;
  }

  slackApp = new App({
    token,
    signingSecret,
    ...(appToken ? { socketMode: true, appToken } : {}),
    logLevel: LogLevel.WARN,
  });

  // /optic slash command
  slackApp.command('/optic', async ({ command, ack, respond }) => {
    await ack();
    const args = command.text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase() || 'help';
    const userId = await resolveSlackUser(command.user_id);

    try {
      if (subCommand === 'status' || subCommand === 'dashboard') {
        const m = await fetchMetricsForSlack(userId);
        await respond({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'OpticData Dashboard' } },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Spend:* ${fmt(m.spend)}` },
                { type: 'mrkdwn', text: `*Revenue:* ${fmt(m.revenue)}` },
                { type: 'mrkdwn', text: `*ROAS:* ${m.roas.toFixed(2)}x` },
                { type: 'mrkdwn', text: `*CPA:* ${fmt(m.cpa)}` },
                { type: 'mrkdwn', text: `*Orders:* ${m.conversions}` },
              ],
            },
          ],
        });
      } else if (subCommand === 'roas') {
        const m = await fetchMetricsForSlack(userId);
        await respond(`ROAS today: *${m.roas.toFixed(2)}x* (${fmt(m.revenue)} / ${fmt(m.spend)})`);
      } else if (subCommand === 'spend') {
        const m = await fetchMetricsForSlack(userId);
        await respond(`Ad spend today: *${fmt(m.spend)}*`);
      } else if (subCommand === 'cpa') {
        const m = await fetchMetricsForSlack(userId);
        await respond(`CPA today: *${fmt(m.cpa)}* (${m.conversions} conversions)`);
      } else if (subCommand === 'revenue') {
        const m = await fetchMetricsForSlack(userId);
        await respond(`Revenue today: *${fmt(m.revenue)}* from ${m.conversions} orders`);
      } else if (subCommand === 'ask') {
        const question = args.slice(1).join(' ');
        if (!question) {
          await respond('Usage: `/optic ask <your question>`');
          return;
        }
        const answer = await askOperatorAI(question, userId);
        await respond(answer);
      } else {
        await respond({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'OpticData Commands' } },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  '`/optic status` — Dashboard overview',
                  '`/optic roas` — Today\'s ROAS',
                  '`/optic spend` — Today\'s ad spend',
                  '`/optic cpa` — Today\'s CPA',
                  '`/optic revenue` — Today\'s revenue',
                  '`/optic ask <question>` — Ask AI about your data',
                ].join('\n'),
              },
            },
          ],
        });
      }
    } catch (err) {
      console.error('[Slack Bot] Command error:', err);
      await respond('Something went wrong. Please try again.');
    }
  });

  // @mention handler for AI questions
  slackApp.event('app_mention', async ({ event, say }: { event: any; say: any }) => {
    const text = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    if (!text) {
      await say('Hi! Ask me anything about your ad performance. Try: "What\'s my ROAS today?"');
      return;
    }

    const userId = await resolveSlackUser(event.user);

    try {
      const answer = await askOperatorAI(text, userId);
      await say({ text: answer, thread_ts: event.ts });
    } catch (err) {
      console.error('[Slack Bot] Mention error:', err);
      await say({ text: 'Sorry, I had trouble processing that. Please try again.', thread_ts: event.ts });
    }
  });

  // Start the app
  (async () => {
    if (appToken) {
      await slackApp!.start();
      console.log('[Slack Bot] Started in socket mode');
    } else {
      console.log('[Slack Bot] Initialized (events via HTTP)');
    }
  })();
}

async function askOperatorAI(question: string, userId: number | null): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'Anthropic API key not configured.';

  // Fetch metrics for context
  const m = await fetchMetricsForSlack(userId);
  const context = `Current metrics: Spend=$${m.spend.toFixed(2)}, Revenue=$${m.revenue.toFixed(2)}, ROAS=${m.roas.toFixed(2)}x, CPA=$${m.cpa.toFixed(2)}, Orders=${m.conversions}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `You are OpticData Operator, a concise media buying assistant answering via Slack. Keep responses short (2-4 sentences). Use Slack markdown formatting (*bold*, _italic_). Here is the user's data:\n${context}`,
    messages: [{ role: 'user', content: question }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  return text || 'No response generated.';
}

export function getSlackApp(): App | null {
  return slackApp;
}
