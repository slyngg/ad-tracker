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

const searchSchema = z.object({
  search_terms: z.string().optional(),
  page_id: z.string().optional(),
  country: z.string().default('US'),
  ad_active_status: z.string().optional(),
  ad_type: z.string().optional(),
  limit: z.number().optional(),
  after: z.string().optional(),
});

// Search Ad Library
router.post('/search', validateBody(searchSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const result = await searchAndCacheAdLibrary(userId, req.body);
    res.json(result);
  } catch (err: any) {
    console.error('Error searching ad library:', err);
    res.status(500).json({ error: err.message || 'Failed to search ad library' });
  }
});

// Get cached results with filters
router.get('/results', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { page_id, search, limit: lim, offset: off } = req.query;
    const limit = Math.min(100, parseInt(lim as string) || 50);
    const offset = parseInt(off as string) || 0;

    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let idx = 2;

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
    const id = parseInt(req.params.id);
    const result = await pool.query('SELECT * FROM ad_library_cache WHERE id = $1 AND user_id = $2', [id, userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching result:', err);
    res.status(500).json({ error: 'Failed to fetch result' });
  }
});

// Save to inspo (saved_creatives)
router.post('/save-to-inspo', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { ad_library_id } = req.body;
    if (!ad_library_id) { res.status(400).json({ error: 'ad_library_id required' }); return; }

    const cached = await pool.query('SELECT * FROM ad_library_cache WHERE id = $1 AND user_id = $2', [ad_library_id, userId]);
    if (cached.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }

    const ad = cached.rows[0];
    const bodies = ad.ad_creative_bodies || [];
    const titles = ad.ad_creative_link_titles || [];

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
        `{"source": "ad_library", "page_name": "${ad.page_name}"}`,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving to inspo:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// Extract template from ad library result
router.post('/extract-template', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { ad_library_id } = req.body;
    if (!ad_library_id) { res.status(400).json({ error: 'ad_library_id required' }); return; }

    // Save to inspo first, then extract template from saved creative
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
  } catch (err: any) {
    console.error('Error extracting template:', err);
    res.status(500).json({ error: err.message || 'Failed to extract template' });
  }
});

// Rate limit status
router.get('/rate-status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
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
    const userId = req.user?.id!;
    const result = await syncFollowedBrands(userId);
    res.json(result);
  } catch (err: any) {
    console.error('Error syncing brands:', err);
    res.status(500).json({ error: err.message || 'Failed to sync brands' });
  }
});

// Get trends for a competitor
router.get('/trends/:pageId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const pageId = req.params.pageId;
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
    const userId = req.user?.id!;
    const result = await computeTrends(userId, req.params.pageId);
    res.json(result);
  } catch (err: any) {
    console.error('Error computing trends:', err);
    res.status(500).json({ error: err.message || 'Failed to compute trends' });
  }
});

// AI competitor analysis (SSE streaming)
router.post('/ai/analyze', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { page_id } = req.body;
    if (!page_id) { res.status(400).json({ error: 'page_id required' }); return; }
    await analyzeCompetitorStrategy(userId, page_id, res);
  } catch (err: any) {
    console.error('Error analyzing competitor:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to analyze' });
    }
  }
});

export default router;
