import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const AVAILABLE_TOOLS = [
  'get_metrics', 'get_analytics', 'get_orders', 'get_costs', 'run_sql',
  'get_notifications', 'get_rules', 'get_settings', 'search_data',
  'get_attribution', 'get_ga4_data', 'get_creative_performance',
  'get_rfm_segments', 'get_pnl', 'get_funnel',
];

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM ai_agents WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching agents:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, system_prompt, tools, model, temperature, icon, color } = req.body;
    if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });

    const safeTools = (tools || []).filter((t: string) => AVAILABLE_TOOLS.includes(t));
    const result = await pool.query(`
      INSERT INTO ai_agents (user_id, name, description, system_prompt, tools, model, temperature, icon, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [userId, name, description, system_prompt, safeTools, model || 'claude-sonnet-4-6', temperature || 0.7, icon || 'bot', color || '#8b5cf6']);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating agent:', err);
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, system_prompt, tools, model, temperature, is_active, icon, color } = req.body;
    const safeTools = tools ? tools.filter((t: string) => AVAILABLE_TOOLS.includes(t)) : undefined;
    await pool.query(`
      UPDATE ai_agents SET name=COALESCE($1,name), description=COALESCE($2,description), system_prompt=COALESCE($3,system_prompt),
        tools=COALESCE($4,tools), model=COALESCE($5,model), temperature=COALESCE($6,temperature),
        is_active=COALESCE($7,is_active), icon=COALESCE($8,icon), color=COALESCE($9,color), updated_at=NOW()
      WHERE id=$10 AND user_id=$11
    `, [name, description, system_prompt, safeTools, model, temperature, is_active, icon, color, parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating agent:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM ai_agents WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting agent:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.get('/:id/conversations', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM agent_conversations WHERE agent_id = $1 AND user_id = $2 ORDER BY updated_at DESC',
      [parseInt(req.params.id), userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.get('/available-tools', async (_req: Request, res: Response) => {
  res.json(AVAILABLE_TOOLS);
});

export default router;
