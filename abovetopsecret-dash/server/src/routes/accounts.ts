import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// ==================== ACCOUNTS ====================

// GET /api/accounts — list user's accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, platform, platform_account_id, currency, timezone, status, color, icon, notes, created_at, updated_at
       FROM accounts
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/summary — all accounts with today's spend/revenue/conversions
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT a.id, a.name, a.platform, a.color, a.status,
        COALESCE(fb.spend, 0) AS spend,
        COALESCE(cc.revenue, 0) AS revenue,
        COALESCE(cc.conversions, 0) AS conversions,
        CASE WHEN COALESCE(fb.spend, 0) > 0 THEN COALESCE(cc.revenue, 0) / fb.spend ELSE 0 END AS roas
       FROM accounts a
       LEFT JOIN (
         SELECT account_id, SUM(spend) AS spend
         FROM fb_ads_today WHERE user_id = $1
         GROUP BY account_id
       ) fb ON fb.account_id = a.id
       LEFT JOIN (
         SELECT account_id,
           SUM(COALESCE(subtotal, revenue)) AS revenue,
           COUNT(DISTINCT order_id) AS conversions
         FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1
         GROUP BY account_id
       ) cc ON cc.account_id = a.id
       WHERE a.user_id = $1 AND a.status != 'archived'
       ORDER BY spend DESC`,
      [userId]
    );
    res.json(result.rows.map(r => ({
      ...r,
      spend: parseFloat(r.spend) || 0,
      revenue: parseFloat(r.revenue) || 0,
      conversions: parseInt(r.conversions) || 0,
      roas: parseFloat(r.roas) || 0,
    })));
  } catch (err) {
    console.error('Error fetching account summary:', err);
    res.status(500).json({ error: 'Failed to fetch account summary' });
  }
});

// POST /api/accounts — create account
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, platform, platform_account_id, currency, timezone, color, icon, notes } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO accounts (user_id, name, platform, platform_account_id, currency, timezone, color, icon, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        name,
        platform || 'meta',
        platform_account_id || null,
        currency || 'USD',
        timezone || 'America/New_York',
        color || '#3b82f6',
        icon || null,
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating account:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/accounts/:id — update account
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, platform, platform_account_id, currency, timezone, status, color, icon, notes } = req.body;

    const result = await pool.query(
      `UPDATE accounts
       SET name = COALESCE($1, name),
           platform = COALESCE($2, platform),
           platform_account_id = COALESCE($3, platform_account_id),
           currency = COALESCE($4, currency),
           timezone = COALESCE($5, timezone),
           status = COALESCE($6, status),
           color = COALESCE($7, color),
           icon = $8,
           notes = $9,
           updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [name, platform, platform_account_id, currency, timezone, status, color, icon ?? null, notes ?? null, id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating account:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id — soft delete (archive)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE accounts SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error archiving account:', err);
    res.status(500).json({ error: 'Failed to archive account' });
  }
});

// POST /api/accounts/:id/test — test platform connection
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT platform, platform_account_id, access_token_encrypted
       FROM accounts WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = result.rows[0];
    if (!account.platform_account_id) {
      res.json({ success: false, error: 'No platform account ID configured' });
      return;
    }

    // For now, return success if account ID is set
    // Full platform-specific testing can be added later
    res.json({ success: true, platform: account.platform, account_id: account.platform_account_id });
  } catch (err) {
    console.error('Error testing account connection:', err);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// ==================== OFFERS ====================

// GET /api/accounts/offers — all offers for user
router.get('/offers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT o.*, a.name AS account_name
       FROM offers o
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching offers:', err);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// POST /api/accounts/offers — create offer
router.post('/offers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      account_id, name, offer_type, identifier,
      utm_campaign_match, campaign_name_match, product_ids,
      cogs, shipping_cost, handling_cost, gateway_fee_pct, gateway_fee_flat,
      target_cpa, target_roas, color, notes,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Verify account belongs to user if provided
    if (account_id) {
      const acctCheck = await pool.query(
        'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
        [account_id, userId]
      );
      if (acctCheck.rows.length === 0) {
        res.status(400).json({ error: 'Account not found or not owned by user' });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO offers (user_id, account_id, name, offer_type, identifier,
         utm_campaign_match, campaign_name_match, product_ids,
         cogs, shipping_cost, handling_cost, gateway_fee_pct, gateway_fee_flat,
         target_cpa, target_roas, color, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        userId,
        account_id || null,
        name,
        offer_type || 'product',
        identifier || null,
        utm_campaign_match || null,
        campaign_name_match || null,
        product_ids ? JSON.stringify(product_ids) : '[]',
        cogs || 0,
        shipping_cost || 0,
        handling_cost || 0,
        gateway_fee_pct || 0,
        gateway_fee_flat || 0,
        target_cpa || null,
        target_roas || null,
        color || '#8b5cf6',
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating offer:', err);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// PUT /api/accounts/offers/:id — update offer
router.put('/offers/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const {
      account_id, name, offer_type, identifier,
      utm_campaign_match, campaign_name_match, product_ids,
      cogs, shipping_cost, handling_cost, gateway_fee_pct, gateway_fee_flat,
      target_cpa, target_roas, status, color, notes,
    } = req.body;

    const result = await pool.query(
      `UPDATE offers
       SET account_id = COALESCE($1, account_id),
           name = COALESCE($2, name),
           offer_type = COALESCE($3, offer_type),
           identifier = $4,
           utm_campaign_match = $5,
           campaign_name_match = $6,
           product_ids = COALESCE($7, product_ids),
           cogs = COALESCE($8, cogs),
           shipping_cost = COALESCE($9, shipping_cost),
           handling_cost = COALESCE($10, handling_cost),
           gateway_fee_pct = COALESCE($11, gateway_fee_pct),
           gateway_fee_flat = COALESCE($12, gateway_fee_flat),
           target_cpa = $13,
           target_roas = $14,
           status = COALESCE($15, status),
           color = COALESCE($16, color),
           notes = $17,
           updated_at = NOW()
       WHERE id = $18 AND user_id = $19
       RETURNING *`,
      [
        account_id, name, offer_type,
        identifier ?? null, utm_campaign_match ?? null, campaign_name_match ?? null,
        product_ids ? JSON.stringify(product_ids) : null,
        cogs, shipping_cost, handling_cost, gateway_fee_pct, gateway_fee_flat,
        target_cpa ?? null, target_roas ?? null,
        status, color, notes ?? null,
        id, userId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating offer:', err);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

// DELETE /api/accounts/offers/:id — soft delete offer
router.delete('/offers/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE offers SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error archiving offer:', err);
    res.status(500).json({ error: 'Failed to archive offer' });
  }
});

export default router;
