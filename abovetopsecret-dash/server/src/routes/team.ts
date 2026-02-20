import { Router, Request, Response } from 'express';
import pool from '../db';
import crypto from 'crypto';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(`
      SELECT t.*, u.email, u.display_name FROM team_members t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.invited_by = $1 OR t.user_id = $1
      ORDER BY t.created_at ASC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching team:', err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

router.post('/invite', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const validRoles = ['admin', 'viewer'];
    const safeRole = validRoles.includes(role) ? role : 'viewer';
    const token = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(`
      INSERT INTO team_members (invited_by, role, invite_email, invite_token, created_at)
      VALUES ($1, $2, $3, $4, NOW()) RETURNING *
    `, [userId, safeRole, email, token]);

    res.json({ ...result.rows[0], invite_link: `/invite/${token}` });
  } catch (err) {
    console.error('Error inviting member:', err);
    res.status(500).json({ error: 'Failed to invite' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { role, permissions } = req.body;
    await pool.query(
      'UPDATE team_members SET role = COALESCE($1, role), permissions = COALESCE($2, permissions), updated_at = NOW() WHERE id = $3 AND invited_by = $4',
      [role, permissions ? JSON.stringify(permissions) : null, parseInt(req.params.id), userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating member:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM team_members WHERE id = $1 AND invited_by = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove' });
  }
});

router.post('/accept-invite', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { token } = req.body;
    const result = await pool.query(
      'UPDATE team_members SET user_id = $1, invite_accepted_at = NOW(), updated_at = NOW() WHERE invite_token = $2 AND invite_accepted_at IS NULL RETURNING *',
      [userId, token]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invalid or expired invite' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error accepting invite:', err);
    res.status(500).json({ error: 'Failed to accept' });
  }
});

export default router;
