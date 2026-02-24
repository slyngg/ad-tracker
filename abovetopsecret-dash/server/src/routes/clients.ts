import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/clients — list user's clients
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, logo_url, notes, created_at, updated_at
       FROM clients
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /api/clients — create client
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, logo_url, notes } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO clients (user_id, name, logo_url, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, logo_url || '', notes || '']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id — update client
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, logo_url, notes } = req.body;

    const result = await pool.query(
      `UPDATE clients
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, logo_url, notes, id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id — delete client (brands get client_id = NULL via ON DELETE SET NULL)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
