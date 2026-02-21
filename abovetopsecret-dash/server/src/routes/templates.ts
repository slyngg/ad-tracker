import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { validateBody } from '../middleware/validate';

const router = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  structure: z.record(z.string(), z.any()).optional(),
  variable_slots: z.array(z.any()).optional(),
  source_creative_id: z.number().int().positive().optional(),
  platform: z.string().max(50).default('meta'),
  creative_type: z.string().max(50).default('ad_copy'),
  tags: z.array(z.string().max(50)).max(20).optional(),
  is_shared: z.boolean().optional(),
});

// Whitelist of columns allowed in updates
const TEMPLATE_UPDATE_FIELDS: Record<string, 'text' | 'jsonb' | 'array' | 'boolean' | 'number'> = {
  name: 'text',
  description: 'text',
  structure: 'jsonb',
  variable_slots: 'jsonb',
  platform: 'text',
  creative_type: 'text',
  tags: 'array',
  is_shared: 'boolean',
};

function parseId(val: string): number | null {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildUpdateQuery(
  body: Record<string, any>,
  allowedFields: Record<string, string>,
): { setClauses: string[]; values: any[] } {
  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, type] of Object.entries(allowedFields)) {
    if (body[key] !== undefined) {
      if (type === 'jsonb') {
        setClauses.push(`${key} = $${idx++}::JSONB`);
        values.push(JSON.stringify(body[key]));
      } else {
        setClauses.push(`${key} = $${idx++}`);
        values.push(body[key]);
      }
    }
  }

  return { setClauses, values };
}

// List templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
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

// Update template (whitelisted fields only)
router.put('/:id', validateBody(createTemplateSchema.partial()), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }

    const { setClauses, values } = buildUpdateQuery(req.body, TEMPLATE_UPDATE_FIELDS);
    if (setClauses.length === 0) { res.json({ success: true }); return; }

    setClauses.push('updated_at = NOW()');
    const idIdx = values.length + 1;
    const userIdx = values.length + 2;
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE creative_templates SET ${setClauses.join(', ')} WHERE id = $${idIdx} AND user_id = $${userIdx} RETURNING *`,
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
    await pool.query('DELETE FROM creative_templates WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
