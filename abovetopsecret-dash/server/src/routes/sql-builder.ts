import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Allowed read-only SQL keywords at statement start
const ALLOWED_PREFIXES = /^\s*(SELECT|WITH|EXPLAIN)\s/i;
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|DO)\b/i;

// POST /api/sql/execute - Execute read-only SQL
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
      res.status(400).json({ error: 'sql is required' });
      return;
    }

    const trimmedSql = sql.trim();

    // Reject non-SELECT queries
    if (!ALLOWED_PREFIXES.test(trimmedSql)) {
      res.status(400).json({ error: 'Only SELECT, WITH, and EXPLAIN queries are allowed' });
      return;
    }

    // Extra safety: reject any mutation keywords anywhere in the query
    if (FORBIDDEN_KEYWORDS.test(trimmedSql)) {
      res.status(400).json({ error: 'Query contains forbidden keywords. Only read-only queries are allowed.' });
      return;
    }

    // Reject multiple statements (semicolon followed by more SQL)
    const withoutStrings = trimmedSql.replace(/'[^']*'/g, '');
    const semicolonParts = withoutStrings.split(';').filter((p) => p.trim().length > 0);
    if (semicolonParts.length > 1) {
      res.status(400).json({ error: 'Only single statements are allowed' });
      return;
    }

    const client = await pool.connect();
    try {
      // Set statement timeout to prevent long-running queries (30 seconds)
      await client.query('SET statement_timeout = 30000');

      const startTime = Date.now();
      const result = await client.query(trimmedSql);
      const duration = Date.now() - startTime;

      const columns = result.fields.map((f) => ({
        name: f.name,
        dataTypeID: f.dataTypeID,
      }));

      res.json({
        columns,
        rows: result.rows,
        rowCount: result.rowCount,
        duration,
      });
    } finally {
      // Reset statement timeout before releasing
      await client.query('SET statement_timeout = 0').catch(() => {});
      client.release();
    }
  } catch (err: any) {
    console.error('Error executing SQL:', err);
    const message = err.message || 'Query execution failed';
    res.status(400).json({ error: message });
  }
});

// GET /api/sql/saved - List saved queries for user
router.get('/saved', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, sql_text, created_at, updated_at
       FROM saved_queries
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching saved queries:', err);
    res.status(500).json({ error: 'Failed to fetch saved queries' });
  }
});

// POST /api/sql/saved - Save a query
router.post('/saved', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, sql_text } = req.body;

    if (!name || !sql_text) {
      res.status(400).json({ error: 'name and sql_text are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO saved_queries (user_id, name, sql_text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, sql_text]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving query:', err);
    res.status(500).json({ error: 'Failed to save query' });
  }
});

// DELETE /api/sql/saved/:id - Delete a saved query
router.delete('/saved/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM saved_queries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Saved query not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting saved query:', err);
    res.status(500).json({ error: 'Failed to delete saved query' });
  }
});

// GET /api/sql/schema - Return table schema info
router.get('/schema', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    `);

    // Group by table
    const schema: Record<string, Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>> = {};
    for (const row of result.rows) {
      if (!schema[row.table_name]) {
        schema[row.table_name] = [];
      }
      schema[row.table_name].push({
        column_name: row.column_name,
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
      });
    }

    res.json(schema);
  } catch (err) {
    console.error('Error fetching schema:', err);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

export default router;
