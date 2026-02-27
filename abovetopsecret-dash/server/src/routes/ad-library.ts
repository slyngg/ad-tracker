import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { validateBody } from '../middleware/validate';
import {
  searchAndCacheAdLibrary,
  getAdLibraryRateStatus,
  syncFollowedBrands,
  computeTrends,
  analyzeCompetitorStrategy,
} from '../services/ad-library';
import { extractTemplate } from '../services/ai-creative-gen';

const router = Router();

function parseId(val: string): number | null {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const searchSchema = z.object({
  platform: z.enum(['meta', 'tiktok']).default('meta'),
  search_terms: z.string().max(500).optional(),
  page_id: z.string().max(100).optional(),
  country: z.string().max(5).default('US'),
  ad_active_status: z.string().max(50).optional(),
  ad_type: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  after: z.string().max(500).optional(),
});

const saveToInspoSchema = z.object({
  ad_library_id: z.number().int().positive(),
});

const extractTemplateSchema = z.object({
  ad_library_id: z.number().int().positive(),
});

const analyzeSchema = z.object({
  page_id: z.string().min(1).max(100),
});

// Featured / recently cached ads (shown on page load)
router.get('/featured', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    // Return recently cached ads with the best data (have impressions or spend), most recent first
    const result = await pool.query(
      `SELECT * FROM ad_library_cache
       WHERE user_id = $1
         AND ad_creative_bodies IS NOT NULL
         AND ad_creative_bodies::TEXT != '[]'
       ORDER BY
         CASE WHEN impressions_upper IS NOT NULL THEN impressions_upper ELSE 0 END DESC,
         created_at DESC
       LIMIT 24`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching featured ads:', err);
    res.status(500).json({ error: 'Failed to fetch featured ads' });
  }
});

// Search Ad Library
router.post('/search', validateBody(searchSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    // Check rate limit before making API call
    const rateStatus = await getAdLibraryRateStatus(userId);
    if (rateStatus.calls_used >= rateStatus.limit) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again later.', reset_at: rateStatus.reset_at });
      return;
    }

    const result = await searchAndCacheAdLibrary(userId, req.body);
    res.json(result);
  } catch (err) {
    console.error('Error searching ad library:', err);
    res.status(500).json({ error: 'Failed to search ad library' });
  }
});

// Get cached results with filters
router.get('/results', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { page_id, search, platform, limit: lim, offset: off } = req.query;
    const limit = Math.min(100, parseInt(lim as string) || 50);
    const offset = Math.max(0, parseInt(off as string) || 0);

    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let idx = 2;

    if (platform) { conditions.push(`platform = $${idx++}`); params.push(platform); }
    if (page_id) { conditions.push(`page_id = $${idx++}`); params.push(page_id); }
    if (search) {
      conditions.push(`(page_name ILIKE $${idx} OR ad_creative_bodies::TEXT ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM ad_library_cache WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching results:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Get single cached result
router.get('/results/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
    const result = await pool.query('SELECT * FROM ad_library_cache WHERE id = $1 AND user_id = $2', [id, userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching result:', err);
    res.status(500).json({ error: 'Failed to fetch result' });
  }
});

// Save to inspo (saved_creatives) — fixed JSON injection
router.post('/save-to-inspo', validateBody(saveToInspoSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { ad_library_id } = req.body;

    const cached = await pool.query('SELECT * FROM ad_library_cache WHERE id = $1 AND user_id = $2', [ad_library_id, userId]);
    if (cached.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }

    const ad = cached.rows[0];
    const bodies = ad.ad_creative_bodies || [];
    const titles = ad.ad_creative_link_titles || [];

    // Use JSON.stringify for tags to prevent injection
    const tags = JSON.stringify({ source: 'ad_library', page_name: ad.page_name });

    await pool.query(
      `INSERT INTO saved_creatives (user_id, platform, ad_id, ad_name, headline, body_text, thumbnail_url, source_url, tags)
       VALUES ($1, 'meta', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        ad.meta_ad_id,
        `${ad.page_name} Ad`,
        titles[0] || '',
        bodies[0] || '',
        ad.ad_snapshot_url || '',
        ad.ad_snapshot_url || '',
        tags,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving to inspo:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// Extract template from ad library result
router.post('/extract-template', validateBody(extractTemplateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { ad_library_id } = req.body;

    const cached = await pool.query('SELECT * FROM ad_library_cache WHERE id = $1 AND user_id = $2', [ad_library_id, userId]);
    if (cached.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }

    const ad = cached.rows[0];
    const bodies = ad.ad_creative_bodies || [];
    const titles = ad.ad_creative_link_titles || [];
    const descriptions = ad.ad_creative_link_descriptions || [];

    // Save as generated_creative for template extraction
    const creativeRes = await pool.query(
      `INSERT INTO generated_creatives (user_id, creative_type, platform, content)
       VALUES ($1, 'ad_copy', 'meta', $2) RETURNING id`,
      [userId, JSON.stringify({
        variations: [{
          headline: titles[0] || '',
          primary_text: bodies[0] || '',
          description: descriptions[0] || '',
          cta: 'LEARN_MORE',
          source: 'ad_library',
          page_name: ad.page_name,
        }]
      })]
    );

    const template = await extractTemplate(creativeRes.rows[0].id, userId);
    res.json(template);
  } catch (err) {
    console.error('Error extracting template:', err);
    res.status(500).json({ error: 'Failed to extract template' });
  }
});

// Rate limit status
router.get('/rate-status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const status = await getAdLibraryRateStatus(userId);
    res.json(status);
  } catch (err) {
    console.error('Error getting rate status:', err);
    res.status(500).json({ error: 'Failed to get rate status' });
  }
});

// Sync followed brands
router.post('/sync-brands', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const result = await syncFollowedBrands(userId);
    res.json(result);
  } catch (err) {
    console.error('Error syncing brands:', err);
    res.status(500).json({ error: 'Failed to sync brands' });
  }
});

// Get trends for a competitor
router.get('/trends/:pageId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const pageId = req.params.pageId;
    if (!pageId || pageId.length > 100) { res.status(400).json({ error: 'Invalid page ID' }); return; }
    const result = await pool.query(
      'SELECT * FROM ad_library_trends WHERE user_id = $1 AND page_id = $2 ORDER BY date DESC LIMIT 30',
      [userId, pageId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Compute trends
router.post('/trends/:pageId/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const pageId = req.params.pageId;
    if (!pageId || pageId.length > 100) { res.status(400).json({ error: 'Invalid page ID' }); return; }
    const result = await computeTrends(userId, pageId);
    res.json(result);
  } catch (err) {
    console.error('Error computing trends:', err);
    res.status(500).json({ error: 'Failed to compute trends' });
  }
});

// AI competitor analysis (SSE streaming)
router.post('/ai/analyze', validateBody(analyzeSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { page_id } = req.body;
    await analyzeCompetitorStrategy(userId, page_id, res);
  } catch (err) {
    console.error('Error analyzing competitor:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to analyze' });
    }
  }
});

export default router;
