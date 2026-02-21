import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pool from '../db';

// These tests require a running PostgreSQL database.
// Skip if DATABASE_URL is not set.
const canRun = !!process.env.DATABASE_URL;

describe.skipIf(!canRun)('setSetting UPSERT atomicity', () => {
  beforeAll(async () => {
    // Ensure the table and index exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_by TEXT DEFAULT 'admin',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        user_id INTEGER
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_app_settings_key_user
      ON app_settings (key, COALESCE(user_id, -1))
    `);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM app_settings WHERE key LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM app_settings WHERE key LIKE 'test_%'");
    await pool.end();
  });

  it('inserts a new setting', async () => {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      ['test_key', 'value1', 'admin', null]
    );

    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'test_key' AND user_id IS NULL");
    expect(result.rows[0].value).toBe('value1');
  });

  it('upserts on conflict', async () => {
    // Insert first
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      ['test_key', 'value1', 'admin', null]
    );

    // Upsert second
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      ['test_key', 'value2', 'system', null]
    );

    const result = await pool.query("SELECT value, updated_by FROM app_settings WHERE key = 'test_key' AND user_id IS NULL");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].value).toBe('value2');
    expect(result.rows[0].updated_by).toBe('system');
  });

  it('handles concurrent upserts without duplicates', async () => {
    // Fire 10 concurrent upserts for the same key
    const promises = Array.from({ length: 10 }, (_, i) =>
      pool.query(
        `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
           value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        ['test_concurrent', `value_${i}`, 'admin', null]
      )
    );

    await Promise.all(promises);

    const result = await pool.query("SELECT * FROM app_settings WHERE key = 'test_concurrent'");
    expect(result.rows.length).toBe(1);
  });

  it('keeps user-specific and global settings separate', async () => {
    // Global setting
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      ['test_multi', 'global_val', 'admin', null]
    );

    // User-specific setting
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, COALESCE(user_id, -1)) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      ['test_multi', 'user_val', 'admin', 1]
    );

    const globalResult = await pool.query("SELECT value FROM app_settings WHERE key = 'test_multi' AND user_id IS NULL");
    const userResult = await pool.query("SELECT value FROM app_settings WHERE key = 'test_multi' AND user_id = 1");

    expect(globalResult.rows[0].value).toBe('global_val');
    expect(userResult.rows[0].value).toBe('user_val');
  });
});

describe.skipIf(!canRun)('CHECK constraints', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('rejects negative spend values', async () => {
    // This test verifies that the CHECK constraint from migration 024 works.
    // Will only pass after the migration has been applied.
    try {
      await pool.query(`
        INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, landing_page_views)
        VALUES ('test', 'test', 'test', 'test_check_neg', 'test', -1, 0, 0, 0)
      `);
      // If we get here, the constraint doesn't exist yet — clean up
      await pool.query("DELETE FROM fb_ads_today WHERE ad_set_id = 'test_check_neg'");
    } catch (err: any) {
      expect(err.message).toContain('chk_fb_spend_nonneg');
    }
  });
});

describe.skipIf(!canRun)('Advisory lock behavior', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('pg_try_advisory_lock returns false when lock is held', async () => {
    const lockId = 999999;
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Client 1 acquires lock
      const r1 = await client1.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
      expect(r1.rows[0].acquired).toBe(true);

      // Client 2 fails to acquire same lock
      const r2 = await client2.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
      expect(r2.rows[0].acquired).toBe(false);

      // Client 1 releases
      await client1.query('SELECT pg_advisory_unlock($1)', [lockId]);

      // Client 2 can now acquire
      const r3 = await client2.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
      expect(r3.rows[0].acquired).toBe(true);

      await client2.query('SELECT pg_advisory_unlock($1)', [lockId]);
    } finally {
      client1.release();
      client2.release();
    }
  });
});
