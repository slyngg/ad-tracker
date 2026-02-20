import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM workspaces WHERE user_id = $1 ORDER BY position, created_at', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workspaces:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await pool.query(
      'INSERT INTO workspaces (user_id, name, description, icon, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, name, description, icon || 'layout-dashboard', color || '#3b82f6']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating workspace:', err);
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, icon, color } = req.body;
    await pool.query(
      'UPDATE workspaces SET name=COALESCE($1,name), description=COALESCE($2,description), icon=COALESCE($3,icon), color=COALESCE($4,color), updated_at=NOW() WHERE id=$5 AND user_id=$6',
      [name, description, icon, color, parseInt(req.params.id), userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating workspace:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM workspaces WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting workspace:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.get('/:id/widgets', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM workspace_widgets WHERE workspace_id = $1 ORDER BY position_y, position_x', [parseInt(req.params.id)]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching widgets:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/:id/widgets', async (req: Request, res: Response) => {
  try {
    const { widget_type, title, config, position_x, position_y, width, height } = req.body;
    const result = await pool.query(
      'INSERT INTO workspace_widgets (workspace_id, widget_type, title, config, position_x, position_y, width, height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [parseInt(req.params.id), widget_type, title, JSON.stringify(config || {}), position_x || 0, position_y || 0, width || 1, height || 1]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating widget:', err);
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.put('/:id/widgets/:widgetId', async (req: Request, res: Response) => {
  try {
    const { title, config, position_x, position_y, width, height } = req.body;
    await pool.query(
      'UPDATE workspace_widgets SET title=COALESCE($1,title), config=COALESCE($2,config), position_x=COALESCE($3,position_x), position_y=COALESCE($4,position_y), width=COALESCE($5,width), height=COALESCE($6,height), updated_at=NOW() WHERE id=$7 AND workspace_id=$8',
      [title, config ? JSON.stringify(config) : null, position_x, position_y, width, height, parseInt(req.params.widgetId), parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating widget:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id/widgets/:widgetId', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM workspace_widgets WHERE id = $1 AND workspace_id = $2', [parseInt(req.params.widgetId), parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting widget:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
