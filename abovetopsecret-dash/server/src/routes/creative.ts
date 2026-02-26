import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/creative/performance
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, platform, type, sort } = req.query;
    const days = parseInt(startDate as string) || 30;
    const sortCol = ['spend', 'roas', 'ctr', 'conversions', 'revenue'].includes(sort as string) ? sort : 'spend';
    const uf = userId ? 'AND user_id = $1' : '';
    const params: any[] = userId ? [userId] : [];

    let filters = '';
    if (platform && platform !== 'all') {
      params.push(String(platform));
      filters += ` AND platform = $${params.length}`;
    }
    if (type && type !== 'all') {
      params.push(String(type));
      filters += ` AND creative_type = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        ad_id, MAX(ad_name) AS ad_name, MAX(platform) AS platform, MAX(creative_type) AS creative_type,
        MAX(headline) AS headline, MAX(image_url) AS image_url, MAX(thumbnail_url) AS thumbnail_url,
        SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
        SUM(conversions) AS conversions, SUM(revenue) AS revenue,
        CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) * 100 ELSE 0 END AS ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END AS cpa,
        CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END AS roas
      FROM creative_performance
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days' ${uf} ${filters}
      GROUP BY ad_id
      ORDER BY ${sortCol} DESC
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching creative performance:', err);
    res.status(500).json({ error: 'Failed to fetch creative data' });
  }
});

// GET /api/creative/compare?ids=id1,id2
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const ids = ((req.query.ids as string) || '').split(',').filter(Boolean);
    if (!ids.length) return res.json([]);

    const placeholders = ids.map((_, i) => `$${i + (userId ? 2 : 1)}`).join(',');
    const params: any[] = userId ? [userId, ...ids] : [...ids];
    const uf = userId ? 'AND user_id = $1' : '';

    const result = await pool.query(`
      SELECT ad_id, MAX(ad_name) AS ad_name, MAX(platform) AS platform, MAX(creative_type) AS creative_type,
        MAX(headline) AS headline, MAX(image_url) AS image_url,
        SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
        SUM(conversions) AS conversions, SUM(revenue) AS revenue,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::NUMERIC/SUM(impressions)*100 ELSE 0 END AS ctr,
        CASE WHEN SUM(spend)>0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS roas,
        CASE WHEN SUM(conversions)>0 THEN SUM(spend)/SUM(conversions) ELSE 0 END AS cpa
      FROM creative_performance
      WHERE ad_id IN (${placeholders}) ${uf}
      GROUP BY ad_id
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error comparing creatives:', err);
    res.status(500).json({ error: 'Failed to compare' });
  }
});

// GET /api/creative/top?metric=roas&limit=10
router.get('/top', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const metric = ['roas', 'ctr', 'conversions', 'revenue'].includes(req.query.metric as string) ? req.query.metric : 'roas';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(`
      SELECT ad_id, MAX(ad_name) AS ad_name, MAX(platform) AS platform, MAX(creative_type) AS creative_type,
        SUM(spend) AS spend, SUM(revenue) AS revenue, SUM(conversions) AS conversions,
        CASE WHEN SUM(spend)>0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS roas,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::NUMERIC/SUM(impressions)*100 ELSE 0 END AS ctr
      FROM creative_performance
      WHERE date >= CURRENT_DATE - INTERVAL '30 days' ${uf}
      GROUP BY ad_id
      HAVING SUM(spend) > 10
      ORDER BY ${metric} DESC
      LIMIT ${limit}
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching top creatives:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// GET /api/creative/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT ad_id) AS total_creatives,
        SUM(spend) AS total_spend,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::NUMERIC/SUM(impressions)*100 ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(spend)>0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS avg_roas,
        MODE() WITHIN GROUP (ORDER BY creative_type) AS top_type
      FROM creative_performance
      WHERE date >= CURRENT_DATE - INTERVAL '30 days' ${uf}
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching creative summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
