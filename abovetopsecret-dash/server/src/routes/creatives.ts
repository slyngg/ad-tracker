import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { tagUntaggedCreatives } from '../services/creative-tagger';

const router = Router();

// ===== WEBHOOK CREATIVE INGESTION =====

// Middleware: authenticate webhook API key (no session required)
async function authenticateWebhookKey(req: Request, res: Response): Promise<number | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer wh_')) {
    res.status(401).json({ error: 'Invalid or missing API key. Use: Authorization: Bearer wh_xxxxx' });
    return null;
  }
  const rawKey = authHeader.slice(7); // Remove 'Bearer '
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const result = await pool.query(
    `UPDATE webhook_api_keys SET last_used_at = NOW()
     WHERE key_hash = $1 AND 'creatives.write' = ANY(scopes)
     RETURNING user_id`,
    [keyHash]
  );
  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid API key' });
    return null;
  }
  return result.rows[0].user_id;
}

// POST /api/creatives/webhook - Ingest creatives from external systems
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const userId = await authenticateWebhookKey(req, res);
    if (userId === null) return;

    const { creatives } = req.body;
    if (!Array.isArray(creatives) || creatives.length === 0) {
      res.status(400).json({ error: 'Request body must include a non-empty "creatives" array' });
      return;
    }
    if (creatives.length > 50) {
      res.status(400).json({ error: 'Maximum 50 creatives per request' });
      return;
    }

    const insertedIds: number[] = [];
    for (const c of creatives) {
      const result = await pool.query(
        `INSERT INTO ad_creatives (
          user_id, ad_name, platform, creative_type, image_url, thumbnail_url,
          ad_copy, headline, status, first_seen, last_seen
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())
        RETURNING id`,
        [
          userId,
          c.name || 'Webhook Creative',
          c.platform || 'meta',
          c.creative_type || 'image',
          c.image_url || null,
          c.thumbnail_url || c.image_url || null,
          c.ad_copy || null,
          c.headline || null,
        ]
      );
      insertedIds.push(result.rows[0].id);
    }

    // Trigger async AI tagging
    tagUntaggedCreatives(userId).catch((err: any) => {
      console.error('[Webhook] Error tagging creatives:', err.message);
    });

    res.status(201).json({ inserted: insertedIds.length, creative_ids: insertedIds });
  } catch (err) {
    console.error('Error in webhook ingestion:', err);
    res.status(500).json({ error: 'Failed to ingest creatives' });
  }
});

// POST /api/creatives/webhook/keys - Generate a new webhook API key
router.post('/webhook/keys', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { name } = req.body;
    const keyName = name || 'Creative Webhook';

    // Generate a random key with wh_ prefix
    const rawKey = `wh_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const result = await pool.query(
      `INSERT INTO webhook_api_keys (user_id, key_hash, key_prefix, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, key_prefix, name, created_at`,
      [userId, keyHash, keyPrefix, keyName]
    );

    // Return the plaintext key only once
    res.status(201).json({ ...result.rows[0], key: rawKey });
  } catch (err) {
    console.error('Error generating webhook key:', err);
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

// GET /api/creatives/webhook/keys - List webhook API keys
router.get('/webhook/keys', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const result = await pool.query(
      'SELECT id, key_prefix, name, scopes, last_used_at, created_at FROM webhook_api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing webhook keys:', err);
    res.status(500).json({ error: 'Failed to list keys' });
  }
});

// DELETE /api/creatives/webhook/keys/:id - Revoke a webhook API key
router.delete('/webhook/keys/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const result = await pool.query(
      'DELETE FROM webhook_api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Key not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Error revoking webhook key:', err);
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

// ===== CREATIVE ANALYTICS ENDPOINTS =====

// GET /api/creatives - List creatives with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      platform, status, campaign_id, creative_type,
      date_from, date_to,
      tag_asset_type, tag_hook_type, tag_visual_format, tag_creative_angle,
      tag_messaging_theme, tag_talent_type, tag_offer_type, tag_cta_style,
      search, sort_by, sort_dir, page, limit,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * pageSize;

    const conditions: string[] = ['ac.user_id = $1'];
    const params: any[] = [userId];
    let paramIdx = 2;

    const { account_id: acctId } = req.query;
    if (platform) { conditions.push(`ac.platform = $${paramIdx++}`); params.push(platform); }
    if (status) { conditions.push(`ac.status = $${paramIdx++}`); params.push(status); }
    if (campaign_id) { conditions.push(`ac.campaign_id = $${paramIdx++}`); params.push(campaign_id); }
    if (creative_type) { conditions.push(`ac.creative_type = $${paramIdx++}`); params.push(creative_type); }
    if (acctId) { conditions.push(`ac.account_id = $${paramIdx++}`); params.push(acctId); }
    if (search) { conditions.push(`(ac.ad_name ILIKE $${paramIdx} OR ac.ad_copy ILIKE $${paramIdx})`); params.push(`%${search}%`); paramIdx++; }

    // Tag filters
    if (tag_asset_type) { conditions.push(`ct.asset_type = $${paramIdx++}`); params.push(tag_asset_type); }
    if (tag_hook_type) { conditions.push(`ct.hook_type = $${paramIdx++}`); params.push(tag_hook_type); }
    if (tag_visual_format) { conditions.push(`ct.visual_format = $${paramIdx++}`); params.push(tag_visual_format); }
    if (tag_creative_angle) { conditions.push(`ct.creative_angle = $${paramIdx++}`); params.push(tag_creative_angle); }
    if (tag_messaging_theme) { conditions.push(`ct.messaging_theme = $${paramIdx++}`); params.push(tag_messaging_theme); }
    if (tag_talent_type) { conditions.push(`ct.talent_type = $${paramIdx++}`); params.push(tag_talent_type); }
    if (tag_offer_type) { conditions.push(`ct.offer_type = $${paramIdx++}`); params.push(tag_offer_type); }
    if (tag_cta_style) { conditions.push(`ct.cta_style = $${paramIdx++}`); params.push(tag_cta_style); }

    // Date filters for metrics (add 1 day buffer to date_to for timezone tolerance)
    let dateFilter = '';
    if (date_from) { dateFilter += ` AND cmd.date >= $${paramIdx++}::DATE`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND cmd.date <= ($${paramIdx++}::DATE + INTERVAL '1 day')`; params.push(date_to); }

    const allowedSorts = ['spend', 'roas', 'cpa', 'revenue', 'clicks', 'impressions', 'ctr', 'cvr'];
    const sortField = allowedSorts.includes(sort_by as string) ? sort_by : 'spend';
    const sortDirection = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const result = await pool.query(`
      WITH metrics_agg AS (
        SELECT creative_id,
          SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
          SUM(purchases) AS purchases, SUM(revenue) AS revenue,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) ELSE 0 END AS ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
          CASE WHEN SUM(spend) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END AS cpm,
          CASE WHEN SUM(purchases) > 0 THEN SUM(spend) / SUM(purchases) ELSE 0 END AS cpa,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END AS roas,
          CASE WHEN SUM(clicks) > 0 THEN SUM(purchases)::NUMERIC / SUM(clicks) ELSE 0 END AS cvr
        FROM creative_metrics_daily cmd
        WHERE 1=1 ${dateFilter}
        GROUP BY creative_id
      )
      SELECT ac.*, ct.asset_type, ct.visual_format, ct.hook_type, ct.creative_angle,
        ct.messaging_theme, ct.talent_type, ct.offer_type, ct.cta_style, ct.ai_confidence,
        COALESCE(ma.spend, 0) AS spend, COALESCE(ma.impressions, 0) AS impressions,
        COALESCE(ma.clicks, 0) AS clicks, COALESCE(ma.purchases, 0) AS purchases,
        COALESCE(ma.revenue, 0) AS revenue, COALESCE(ma.ctr, 0) AS ctr,
        COALESCE(ma.cpc, 0) AS cpc, COALESCE(ma.cpm, 0) AS cpm,
        COALESCE(ma.cpa, 0) AS cpa, COALESCE(ma.roas, 0) AS roas, COALESCE(ma.cvr, 0) AS cvr
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN metrics_agg ma ON ma.creative_id = ac.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortField} ${sortDirection} NULLS LAST
      LIMIT ${pageSize} OFFSET ${offset}
    `, params);

    res.json({ data: result.rows, page: pageNum, limit: pageSize });
  } catch (err) {
    console.error('Error fetching creatives:', err);
    res.status(500).json({ error: 'Failed to fetch creatives' });
  }
});

// GET /api/creatives/top-performing
router.get('/top-performing', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { date_from, date_to, group_by, sort_by, limit: lim, platform, account_id } = req.query;
    const pageSize = Math.min(100, parseInt(lim as string) || 20);

    const conditions: string[] = ['ac.user_id = $1'];
    const params: any[] = [userId];
    let paramIdx = 2;

    if (platform) { conditions.push(`ac.platform = $${paramIdx++}`); params.push(platform); }
    if (account_id) { conditions.push(`ac.account_id = $${paramIdx++}`); params.push(account_id); }

    let dateFilter = '';
    if (date_from) { dateFilter += ` AND cmd.date >= $${paramIdx++}::DATE`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND cmd.date <= ($${paramIdx++}::DATE + INTERVAL '1 day')`; params.push(date_to); }

    const result = await pool.query(`
      WITH metrics_agg AS (
        SELECT creative_id,
          SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
          SUM(purchases) AS purchases, SUM(revenue) AS revenue,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) ELSE 0 END AS ctr,
          CASE WHEN SUM(purchases) > 0 THEN SUM(spend) / SUM(purchases) ELSE 0 END AS cpa,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END AS roas,
          CASE WHEN SUM(clicks) > 0 THEN SUM(purchases)::NUMERIC / SUM(clicks) ELSE 0 END AS cvr
        FROM creative_metrics_daily cmd
        WHERE 1=1 ${dateFilter}
        GROUP BY creative_id
      )
      SELECT ac.id, ac.ad_id, ac.ad_name, ac.campaign_name, ac.adset_name, ac.creative_type,
        ac.thumbnail_url, ac.image_url, ac.headline, ac.platform, ac.status, ac.account_id,
        a.name AS account_name,
        ct.asset_type, ct.visual_format, ct.hook_type, ct.creative_angle,
        ct.messaging_theme, ct.talent_type, ct.offer_type, ct.cta_style,
        ma.spend, ma.impressions, ma.clicks, ma.purchases, ma.revenue,
        ma.ctr, ma.cpa, ma.roas, ma.cvr
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN accounts a ON a.id = ac.account_id
      INNER JOIN metrics_agg ma ON ma.creative_id = ac.id
      WHERE ${conditions.join(' AND ')} AND ma.spend > 0
      ORDER BY ma.spend DESC NULLS LAST
      LIMIT ${pageSize}
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching top performing:', err);
    res.status(500).json({ error: 'Failed to fetch top performing creatives' });
  }
});

// GET /api/creatives/comparative
router.get('/comparative', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { date_from, date_to, dimension, metric, account_id } = req.query;

    const tagDimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle',
      'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];
    const otherDimensions = ['campaign_name', 'adset_name', 'creative_type'];
    const allDimensions = [...tagDimensions, ...otherDimensions];

    const dim = allDimensions.includes(dimension as string) ? dimension as string : 'asset_type';
    const isTagDim = tagDimensions.includes(dim);
    const dimColumn = isTagDim ? `ct.${dim}` : `ac.${dim}`;

    const conditions: string[] = ['ac.user_id = $1'];
    const params: any[] = [userId];
    let paramIdx = 2;

    if (account_id) { conditions.push(`ac.account_id = $${paramIdx++}`); params.push(account_id); }

    let dateFilter = '';
    if (date_from) { dateFilter += ` AND cmd.date >= $${paramIdx++}::DATE`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND cmd.date <= ($${paramIdx++}::DATE + INTERVAL '1 day')`; params.push(date_to); }

    const result = await pool.query(`
      SELECT ${dimColumn} AS dimension_value,
        COUNT(DISTINCT ac.id) AS creative_count,
        SUM(cmd.spend) AS total_spend, SUM(cmd.revenue) AS total_revenue,
        CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS avg_roas,
        CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END AS avg_cpa,
        CASE WHEN SUM(cmd.impressions) > 0 THEN SUM(cmd.clicks)::NUMERIC / SUM(cmd.impressions) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(cmd.clicks) > 0 THEN SUM(cmd.purchases)::NUMERIC / SUM(cmd.clicks) ELSE 0 END AS avg_cvr
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id ${dateFilter.replace(/AND/g, 'AND')}
      WHERE ${conditions.join(' AND ')} AND ${dimColumn} IS NOT NULL
      GROUP BY ${dimColumn}
      ORDER BY total_spend DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching comparative:', err);
    res.status(500).json({ error: 'Failed to fetch comparative data' });
  }
});

// GET /api/creatives/launch-analysis
router.get('/launch-analysis', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { account_id } = req.query;

    const conditions: string[] = ['ac.user_id = $1'];
    const params: any[] = [userId];
    if (account_id) { conditions.push(`ac.account_id = $2`); params.push(account_id); }

    const result = await pool.query(`
      WITH recent_creatives AS (
        SELECT ac.*, ct.asset_type, ct.hook_type, ct.creative_angle, ct.visual_format
        FROM ad_creatives ac
        LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
        WHERE ${conditions.join(' AND ')} AND ac.first_seen >= CURRENT_DATE - INTERVAL '7 days'
      ),
      first_3 AS (
        SELECT creative_id, SUM(spend) AS spend, SUM(revenue) AS revenue,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END AS roas
        FROM creative_metrics_daily
        WHERE date < CURRENT_DATE - INTERVAL '4 days' AND date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY creative_id
      ),
      last_3 AS (
        SELECT creative_id, SUM(spend) AS spend, SUM(revenue) AS revenue,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END AS roas
        FROM creative_metrics_daily
        WHERE date >= CURRENT_DATE - INTERVAL '3 days'
        GROUP BY creative_id
      )
      SELECT rc.*,
        COALESCE(f3.spend, 0) AS first_3_spend, COALESCE(f3.roas, 0) AS first_3_roas,
        COALESCE(l3.spend, 0) AS last_3_spend, COALESCE(l3.roas, 0) AS last_3_roas,
        CASE
          WHEN COALESCE(l3.spend, 0) > COALESCE(f3.spend, 0) * 1.1 AND COALESCE(l3.roas, 0) >= COALESCE(f3.roas, 0) * 0.9 THEN 'scaling'
          WHEN COALESCE(l3.spend, 0) < COALESCE(f3.spend, 0) * 0.9 OR COALESCE(l3.roas, 0) < COALESCE(f3.roas, 0) * 0.7 THEN 'declining'
          ELSE 'neutral'
        END AS momentum
      FROM recent_creatives rc
      LEFT JOIN first_3 f3 ON f3.creative_id = rc.id
      LEFT JOIN last_3 l3 ON l3.creative_id = rc.id
      ORDER BY last_3_spend DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching launch analysis:', err);
    res.status(500).json({ error: 'Failed to fetch launch analysis' });
  }
});

// GET /api/creatives/diversity
router.get('/diversity', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle',
      'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];

    const diversity: Record<string, Record<string, number>> = {};

    for (const dim of dimensions) {
      const result = await pool.query(
        `SELECT ct.${dim} AS val, COUNT(*) AS cnt
         FROM ad_creatives ac
         JOIN creative_tags ct ON ct.creative_id = ac.id
         WHERE ac.user_id = $1 AND ac.status = 'active' AND ct.${dim} IS NOT NULL
         GROUP BY ct.${dim}
         ORDER BY cnt DESC`,
        [userId]
      );
      diversity[dim] = {};
      for (const row of result.rows) {
        diversity[dim][row.val] = parseInt(row.cnt);
      }
    }

    res.json(diversity);
  } catch (err) {
    console.error('Error fetching diversity:', err);
    res.status(500).json({ error: 'Failed to fetch diversity data' });
  }
});

// GET /api/creatives/tags/distribution
router.get('/tags/distribution', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle',
      'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];

    const distribution: Record<string, any[]> = {};

    for (const dim of dimensions) {
      const result = await pool.query(
        `SELECT ct.${dim} AS val, COUNT(DISTINCT ac.id) AS creative_count,
          SUM(cmd.spend) AS total_spend,
          CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS avg_roas
         FROM ad_creatives ac
         JOIN creative_tags ct ON ct.creative_id = ac.id
         LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
         WHERE ac.user_id = $1 AND ct.${dim} IS NOT NULL
         GROUP BY ct.${dim}
         ORDER BY total_spend DESC NULLS LAST`,
        [userId]
      );
      distribution[dim] = result.rows;
    }

    res.json(distribution);
  } catch (err) {
    console.error('Error fetching tag distribution:', err);
    res.status(500).json({ error: 'Failed to fetch tag distribution' });
  }
});

// GET /api/creatives/:id - Single creative detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const creative = await pool.query(
      `SELECT ac.*, ct.asset_type, ct.visual_format, ct.hook_type, ct.creative_angle,
        ct.messaging_theme, ct.talent_type, ct.offer_type, ct.cta_style, ct.ai_confidence
       FROM ad_creatives ac
       LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
       WHERE ac.id = $1 AND ac.user_id = $2`,
      [id, userId]
    );

    if (creative.rows.length === 0) {
      res.status(404).json({ error: 'Creative not found' });
      return;
    }

    const metrics = await pool.query(
      `SELECT * FROM creative_metrics_daily WHERE creative_id = $1 ORDER BY date ASC`,
      [id]
    );

    res.json({ ...creative.rows[0], daily_metrics: metrics.rows });
  } catch (err) {
    console.error('Error fetching creative detail:', err);
    res.status(500).json({ error: 'Failed to fetch creative detail' });
  }
});

// POST /api/creatives/tag - Trigger AI tagging
router.post('/tag', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await tagUntaggedCreatives(userId ?? undefined);
    res.json(result);
  } catch (err) {
    console.error('Error triggering tagging:', err);
    res.status(500).json({ error: 'Failed to trigger tagging' });
  }
});

// ===== INSPO / RESEARCH ENDPOINTS =====

// GET /api/creatives/inspo/feed
router.get('/inspo/feed', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT sc.* FROM saved_creatives sc
       JOIN followed_brands fb ON fb.user_id = sc.user_id AND fb.brand_name = sc.brand_name
       WHERE sc.user_id = $1
       ORDER BY sc.saved_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({ data: result.rows, page, limit });
  } catch (err) {
    console.error('Error fetching inspo feed:', err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// POST /api/creatives/inspo/save
router.post('/inspo/save', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { platform, brand_name, ad_id, thumbnail_url, video_url, ad_copy, headline, notes, tags } = req.body;

    const result = await pool.query(
      `INSERT INTO saved_creatives (user_id, platform, brand_name, ad_id, thumbnail_url, video_url, ad_copy, headline, notes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, platform, brand_name, ad_id, thumbnail_url, video_url, ad_copy, headline, notes, JSON.stringify(tags || [])]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving creative:', err);
    res.status(500).json({ error: 'Failed to save creative' });
  }
});

// GET /api/creatives/inspo/saved
router.get('/inspo/saved', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { search, platform, brand_name, page: p, limit: l } = req.query;
    const page = Math.max(1, parseInt(p as string) || 1);
    const limit = Math.min(50, parseInt(l as string) || 20);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let idx = 2;

    if (search) { conditions.push(`(ad_copy ILIKE $${idx} OR headline ILIKE $${idx} OR brand_name ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (platform) { conditions.push(`platform = $${idx++}`); params.push(platform); }
    if (brand_name) { conditions.push(`brand_name = $${idx++}`); params.push(brand_name); }

    const result = await pool.query(
      `SELECT * FROM saved_creatives WHERE ${conditions.join(' AND ')} ORDER BY saved_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    res.json({ data: result.rows, page, limit });
  } catch (err) {
    console.error('Error fetching saved:', err);
    res.status(500).json({ error: 'Failed to fetch saved creatives' });
  }
});

// DELETE /api/creatives/inspo/saved/:id
router.delete('/inspo/saved/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'DELETE FROM saved_creatives WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting saved creative:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// GET /api/creatives/inspo/brands
router.get('/inspo/brands', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM followed_brands WHERE user_id = $1 ORDER BY followed_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// POST /api/creatives/inspo/brands
router.post('/inspo/brands', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { brand_name, platform, platform_page_id } = req.body;

    const result = await pool.query(
      `INSERT INTO followed_brands (user_id, brand_name, platform, platform_page_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, platform, platform_page_id) DO NOTHING
       RETURNING *`,
      [userId, brand_name, platform || 'meta', platform_page_id || null]
    );

    res.status(201).json(result.rows[0] || { message: 'Already following' });
  } catch (err) {
    console.error('Error following brand:', err);
    res.status(500).json({ error: 'Failed to follow brand' });
  }
});

// DELETE /api/creatives/inspo/brands/:id
router.delete('/inspo/brands/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'DELETE FROM followed_brands WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Error unfollowing brand:', err);
    res.status(500).json({ error: 'Failed to unfollow' });
  }
});

// ===== BOARD ENDPOINTS =====

// GET /api/creatives/boards
router.get('/boards', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT cb.*, COUNT(bi.id) AS item_count
       FROM creative_boards cb
       LEFT JOIN board_items bi ON bi.board_id = cb.id
       WHERE cb.user_id = $1
       GROUP BY cb.id
       ORDER BY cb.updated_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching boards:', err);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// POST /api/creatives/boards
router.post('/boards', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO creative_boards (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating board:', err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// PUT /api/creatives/boards/:id
router.put('/boards/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description } = req.body;
    const result = await pool.query(
      `UPDATE creative_boards SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [name, description, req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating board:', err);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// DELETE /api/creatives/boards/:id
router.delete('/boards/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'DELETE FROM creative_boards WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting board:', err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// POST /api/creatives/boards/:id/items
router.post('/boards/:id/items', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { saved_creative_id, position } = req.body;

    // Verify board ownership
    const board = await pool.query('SELECT id FROM creative_boards WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (board.rows.length === 0) { res.status(404).json({ error: 'Board not found' }); return; }

    const result = await pool.query(
      `INSERT INTO board_items (board_id, saved_creative_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, saved_creative_id) DO NOTHING
       RETURNING *`,
      [req.params.id, saved_creative_id, position || 0]
    );

    await pool.query('UPDATE creative_boards SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.status(201).json(result.rows[0] || { message: 'Already added' });
  } catch (err) {
    console.error('Error adding board item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// DELETE /api/creatives/boards/:id/items/:itemId
router.delete('/boards/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    // Verify board ownership
    const board = await pool.query('SELECT id FROM creative_boards WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (board.rows.length === 0) { res.status(404).json({ error: 'Board not found' }); return; }

    await pool.query('DELETE FROM board_items WHERE id = $1 AND board_id = $2', [req.params.itemId, req.params.id]);
    await pool.query('UPDATE creative_boards SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing board item:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// ===== SNAPSHOT ENDPOINTS =====

// POST /api/creatives/snapshots
router.post('/snapshots', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, report_type, report_config, is_live, expires_in_hours } = req.body;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600000) : null;

    let snapshotData = null;
    if (!is_live) {
      // For static snapshots, we'd execute the report and freeze the data
      // For now store the config — the public endpoint will execute it
      snapshotData = null;
    }

    const result = await pool.query(
      `INSERT INTO report_snapshots (user_id, snapshot_token, title, report_type, report_config, snapshot_data, is_live, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, token, title, report_type, JSON.stringify(report_config), snapshotData ? JSON.stringify(snapshotData) : null, is_live || false, expiresAt]
    );

    res.status(201).json({ ...result.rows[0], url: `/api/creatives/public/snapshot/${token}` });
  } catch (err) {
    console.error('Error creating snapshot:', err);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// GET /api/creatives/snapshots
router.get('/snapshots', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT id, snapshot_token, title, report_type, is_live, expires_at, created_at FROM report_snapshots WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching snapshots:', err);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// DELETE /api/creatives/snapshots/:id
router.delete('/snapshots/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'DELETE FROM report_snapshots WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting snapshot:', err);
    res.status(500).json({ error: 'Failed to delete snapshot' });
  }
});

// ===== AI CREATIVE ANALYSIS ENDPOINTS =====

async function streamAIResponse(res: Response, systemPrompt: string, userContent: string): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Anthropic API key not configured' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('');

    // Stream in chunks
    const chunkSize = 30;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
}

// POST /api/creatives/ai/analyze-report
router.post('/ai/analyze-report', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { report_type, filters, date_from, date_to } = req.body;

    const params: any[] = [userId];
    let dateFilter = '';
    let paramIdx = 2;
    if (date_from) { dateFilter += ` AND cmd.date >= $${paramIdx++}::DATE`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND cmd.date <= $${paramIdx++}::DATE`; params.push(date_to); }

    const result = await pool.query(`
      SELECT ac.ad_name, ac.creative_type, ac.headline, ac.ad_copy,
        ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme,
        SUM(cmd.spend) AS spend, SUM(cmd.revenue) AS revenue,
        CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas,
        CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END AS cpa,
        CASE WHEN SUM(cmd.impressions) > 0 THEN SUM(cmd.clicks)::NUMERIC / SUM(cmd.impressions) ELSE 0 END AS ctr
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id ${dateFilter.replace(/AND/g, 'AND')}
      WHERE ac.user_id = $1
      GROUP BY ac.id, ac.ad_name, ac.creative_type, ac.headline, ac.ad_copy,
        ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme
      ORDER BY spend DESC NULLS LAST
      LIMIT 30
    `, params);

    const reportData = JSON.stringify(result.rows, null, 2);

    await streamAIResponse(
      res,
      'You are a senior creative strategist analyzing ad performance reports. Be specific and actionable.',
      `Analyze this ad performance report. Identify the top 3 winners and explain WHY they're winning based on their creative attributes. Identify the bottom 3 and explain what to fix. Give specific, actionable recommendations.\n\nReport Data:\n${reportData}`
    );
  } catch (err) {
    console.error('Error in AI analyze-report:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to analyze report' });
  }
});

// POST /api/creatives/ai/diversity-check
router.post('/ai/diversity-check', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const dimensions = ['asset_type', 'visual_format', 'hook_type', 'creative_angle',
      'messaging_theme', 'talent_type', 'offer_type', 'cta_style'];

    const diversity: Record<string, any> = {};
    for (const dim of dimensions) {
      const result = await pool.query(
        `SELECT ct.${dim} AS val, COUNT(*) AS cnt
         FROM ad_creatives ac JOIN creative_tags ct ON ct.creative_id = ac.id
         WHERE ac.user_id = $1 AND ac.status = 'active' AND ct.${dim} IS NOT NULL
         GROUP BY ct.${dim} ORDER BY cnt DESC`,
        [userId]
      );
      diversity[dim] = result.rows;
    }

    await streamAIResponse(
      res,
      'You are a senior creative strategist. Analyze creative diversity and recommend gaps to fill.',
      `Analyze this creative diversity breakdown. Identify which categories are overrepresented and underrepresented. Recommend specific creative concepts to fill the gaps. Be specific about formats, hooks, and angles to test.\n\nDiversity Data:\n${JSON.stringify(diversity, null, 2)}`
    );
  } catch (err) {
    console.error('Error in AI diversity-check:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to check diversity' });
  }
});

// POST /api/creatives/ai/next-ads
router.post('/ai/next-ads', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const topPerformers = await pool.query(`
      SELECT ac.ad_name, ac.headline, ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.visual_format,
        SUM(cmd.spend) AS spend, CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
      WHERE ac.user_id = $1
      GROUP BY ac.id, ac.ad_name, ac.headline, ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.visual_format
      HAVING SUM(cmd.spend) > 0
      ORDER BY roas DESC
      LIMIT 20
    `, [userId]);

    await streamAIResponse(
      res,
      'You are a senior creative strategist recommending new ad concepts.',
      `Based on these winning patterns, recommend the next 5 ads to create. For each, specify: format, hook type, angle, messaging, and a 2-sentence creative brief.\n\nTop Performers:\n${JSON.stringify(topPerformers.rows, null, 2)}`
    );
  } catch (err) {
    console.error('Error in AI next-ads:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// POST /api/creatives/ai/weekly-retro
router.post('/ai/weekly-retro', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await pool.query(`
      SELECT ac.ad_name, ac.creative_type, ac.first_seen, ac.headline,
        ct.asset_type, ct.hook_type, ct.creative_angle,
        SUM(cmd.spend) AS spend, SUM(cmd.revenue) AS revenue,
        CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas,
        CASE WHEN SUM(cmd.purchases) > 0 THEN SUM(cmd.spend) / SUM(cmd.purchases) ELSE 0 END AS cpa
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '7 days'
      WHERE ac.user_id = $1
      GROUP BY ac.id, ac.ad_name, ac.creative_type, ac.first_seen, ac.headline,
        ct.asset_type, ct.hook_type, ct.creative_angle
      HAVING SUM(cmd.spend) > 0
      ORDER BY spend DESC
      LIMIT 30
    `, [userId]);

    await streamAIResponse(
      res,
      'You are a senior creative strategist running a weekly ad retrospective.',
      `This is the past week's creative performance. Summarize: what worked, what didn't, what's new and showing promise. Give 3 specific action items for next week.\n\nWeekly Data:\n${JSON.stringify(result.rows, null, 2)}`
    );
  } catch (err) {
    console.error('Error in AI weekly-retro:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to run retro' });
  }
});

// POST /api/creatives/ai/competitor-intel
router.post('/ai/competitor-intel', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { brand_name } = req.body;

    const result = await pool.query(
      'SELECT * FROM saved_creatives WHERE user_id = $1 AND brand_name ILIKE $2 ORDER BY saved_at DESC LIMIT 30',
      [userId, `%${brand_name}%`]
    );

    if (result.rows.length === 0) {
      res.json({ message: 'No saved ads found for this competitor. Save some ads to the Inspo library first.' });
      return;
    }

    await streamAIResponse(
      res,
      'You are a competitive intelligence analyst specializing in creative strategy.',
      `Analyze these competitor ads from ${brand_name}. What themes, formats, and hooks are they using? What can we learn? Suggest 3 creative concepts inspired by their approach but differentiated for our brand.\n\nCompetitor Ads:\n${JSON.stringify(result.rows, null, 2)}`
    );
  } catch (err) {
    console.error('Error in AI competitor-intel:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to analyze competitor' });
  }
});

// POST /api/creatives/ai/pre-launch
router.post('/ai/pre-launch', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { ad_copy, headline, creative_type, image_url } = req.body;

    const topPerformers = await pool.query(`
      SELECT ac.ad_name, ac.headline, ac.ad_copy, ac.creative_type,
        ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme,
        CASE WHEN SUM(cmd.spend) > 0 THEN SUM(cmd.revenue) / SUM(cmd.spend) ELSE 0 END AS roas
      FROM ad_creatives ac
      LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
      LEFT JOIN creative_metrics_daily cmd ON cmd.creative_id = ac.id AND cmd.date >= CURRENT_DATE - INTERVAL '30 days'
      WHERE ac.user_id = $1
      GROUP BY ac.id, ac.ad_name, ac.headline, ac.ad_copy, ac.creative_type,
        ct.asset_type, ct.hook_type, ct.creative_angle, ct.messaging_theme
      HAVING SUM(cmd.spend) > 10
      ORDER BY roas DESC
      LIMIT 10
    `, [userId]);

    const proposed = `Ad Copy: ${ad_copy}\nHeadline: ${headline || 'N/A'}\nType: ${creative_type || 'N/A'}`;

    await streamAIResponse(
      res,
      'You are a creative performance analyst scoring ad concepts against historical data.',
      `Score this ad creative concept against historical winners. Rate 1-10 on: hook strength, message clarity, offer appeal, CTA effectiveness, creative freshness. Identify risks and suggest improvements.\n\nProposed Ad:\n${proposed}\n\nHistorical Top Performers:\n${JSON.stringify(topPerformers.rows, null, 2)}`
    );
  } catch (err) {
    console.error('Error in AI pre-launch:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to score creative' });
  }
});

export default router;
