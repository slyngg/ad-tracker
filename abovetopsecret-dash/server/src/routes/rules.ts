import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/rules - List user's automation rules
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config,
              enabled, last_triggered_at, created_at, updated_at
       FROM automation_rules
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching rules:', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST /api/rules - Create a new rule
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, trigger_type, trigger_config, action_type, action_config } = req.body;

    if (!name || !trigger_type || !action_type) {
      res.status(400).json({ error: 'name, trigger_type, and action_type are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO automation_rules (user_id, name, description, trigger_type, trigger_config, action_type, action_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        name,
        description || null,
        trigger_type,
        trigger_config ? JSON.stringify(trigger_config) : '{}',
        action_type,
        action_config ? JSON.stringify(action_config) : '{}',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating rule:', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT /api/rules/:id - Update a rule
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, description, trigger_type, trigger_config, action_type, action_config } = req.body;

    if (!name || !trigger_type || !action_type) {
      res.status(400).json({ error: 'name, trigger_type, and action_type are required' });
      return;
    }

    const result = await pool.query(
      `UPDATE automation_rules
       SET name = $1, description = $2, trigger_type = $3, trigger_config = $4,
           action_type = $5, action_config = $6, updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        name,
        description || null,
        trigger_type,
        trigger_config ? JSON.stringify(trigger_config) : '{}',
        action_type,
        action_config ? JSON.stringify(action_config) : '{}',
        id,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating rule:', err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /api/rules/:id - Delete a rule
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Delete execution logs first
    await pool.query(
      'DELETE FROM rule_execution_log WHERE rule_id = $1',
      [id]
    );

    const result = await pool.query(
      'DELETE FROM automation_rules WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting rule:', err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// GET /api/rules/:id/logs - Execution history
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verify rule belongs to user
    const ruleCheck = await pool.query(
      'SELECT id FROM automation_rules WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (ruleCheck.rows.length === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const result = await pool.query(
      `SELECT id, status, trigger_data, action_result, error_message, executed_at
       FROM rule_execution_log
       WHERE rule_id = $1
       ORDER BY executed_at DESC
       LIMIT 100`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching rule logs:', err);
    res.status(500).json({ error: 'Failed to fetch rule execution logs' });
  }
});

// POST /api/rules/:id/toggle - Enable/disable a rule
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE automation_rules
       SET enabled = NOT enabled, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, enabled`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error toggling rule:', err);
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

export default router;
