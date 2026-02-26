import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    // Get from data_dictionary table + auto-populate from information_schema
    const customEntries = await pool.query(
      'SELECT * FROM data_dictionary WHERE user_id IS NULL OR user_id = $1 ORDER BY table_name, column_name',
      [userId]
    );

    const schemaResult = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name NOT LIKE 'pg_%'
      ORDER BY table_name, ordinal_position
    `);

    // Merge: custom descriptions override auto-detected
    const customMap = new Map(customEntries.rows.map(r => [`${r.table_name}.${r.column_name}`, r]));

    const tables: Record<string, any[]> = {};
    for (const col of schemaResult.rows) {
      if (!tables[col.table_name]) tables[col.table_name] = [];
      const custom = customMap.get(`${col.table_name}.${col.column_name}`);
      tables[col.table_name].push({
        column_name: col.column_name,
        data_type: col.data_type,
        is_nullable: col.is_nullable,
        description: custom?.description || '',
        example_value: custom?.example_value || '',
        category: custom?.category || 'dimensions',
      });
    }

    res.json(tables);
  } catch (err) {
    console.error('Error fetching data dictionary:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { table_name, column_name, description, example_value, category } = req.body;
    if (!table_name || !column_name) return res.status(400).json({ error: 'table_name and column_name required' });

    const result = await pool.query(`
      INSERT INTO data_dictionary (table_name, column_name, description, example_value, category, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (table_name, column_name) DO UPDATE SET description = EXCLUDED.description, example_value = EXCLUDED.example_value, category = EXCLUDED.category, updated_at = NOW()
      RETURNING *
    `, [table_name, column_name, description, example_value, category, userId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving dictionary entry:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

export default router;
