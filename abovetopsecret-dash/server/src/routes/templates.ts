import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { validateBody } from '../middleware/validate';

const router = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  structure: z.record(z.string(), z.any()).optional(),
  variable_slots: z.array(z.any()).optional(),
  source_creative_id: z.number().optional(),
  platform: z.string().default('meta'),
  creative_type: z.string().default('ad_copy'),
  tags: z.array(z.string()).optional(),
  is_shared: z.boolean().optional(),
});

// List templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM creative_templates WHERE user_id = $1 OR is_shared = true ORDER BY usage_count DESC, updated_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get single template
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT * FROM creative_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)',
      [id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching template:', err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create template
router.post('/', validateBody(createTemplateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, structure, variable_slots, source_creative_id, platform, creative_type, tags, is_shared } = req.body;
    const result = await pool.query(
      `INSERT INTO creative_templates (user_id, name, description, structure, variable_slots, source_creative_id, platform, creative_type, tags, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, name, description || null, JSON.stringify(structure || {}), JSON.stringify(variable_slots || []), source_creative_id || null, platform, creative_type, tags || [], is_shared || false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.put('/:id', validateBody(createTemplateSchema.partial()), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const jsonFields = ['structure', 'variable_slots'];

    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        if (jsonFields.includes(key)) {
          fields.push(`${key} = $${idx++}::JSONB`);
          values.push(JSON.stringify(val));
        } else if (key === 'tags') {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(id, userId);
    const result = await pool.query(
      `UPDATE creative_templates SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Duplicate template
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id);
    const original = await pool.query(
      'SELECT * FROM creative_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)',
      [id, userId]
    );
    if (original.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }

    const t = original.rows[0];
    const result = await pool.query(
      `INSERT INTO creative_templates (user_id, name, description, structure, variable_slots, source_creative_id, platform, creative_type, tags, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) RETURNING *`,
      [userId, `${t.name} (Copy)`, t.description, JSON.stringify(t.structure), JSON.stringify(t.variable_slots), t.source_creative_id, t.platform, t.creative_type, t.tags]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error duplicating template:', err);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

// Delete template
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM creative_templates WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
